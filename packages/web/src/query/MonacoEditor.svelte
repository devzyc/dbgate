<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from 'svelte';

    // 最小化导入：editor.api 提供 monaco 命名空间，editor.all 注册编辑器部件 + suggest 补全
    import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
    import 'monaco-editor/esm/vs/editor/editor.all';

    const dispatch = createEventDispatcher<{ input: string }>();

    export let value: string = '';
    // 那一列的 100 多个历史值，作为补全候选
    export let suggestions: string[] = [];
    export let readOnly = false;
    export let onKeyDown: ((ev: KeyboardEvent) => void) | null = null;

    const LANGUAGE_ID = 'dbgate-cell-text';

    let containerEl: HTMLDivElement;
    let editor: any = null;
    let completionDisposable: any = null;
    let contentBackup = value;
    let isInternalChange = false; // 标记是否是由编辑器内部触发的变化
    
    // 存储 span 标签的位置和颜色信息，用于在纯净文本上重新应用装饰
    interface SpanInfo {
        startOffset: number;  // 在纯净文本中的起始位置
        endOffset: number;    // 在纯净文本中的结束位置
        color: string;        // 颜色名称（如 red, blue, green）
    }
    let spanInfos: SpanInfo[] = [];

    function registerCompletion() {
        // 先注销旧的，避免重复注册
        completionDisposable?.dispose();

        completionDisposable = monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
            // 声明 0-9 为"触发字符"（trigger characters），用于绕开 Monaco 对纯数字单词
            // 不触发 quickSuggestions 的内置限制（见 suggestModel.js 的 LineContext.shouldAutoTrigger：
            // 当已输入内容可被 Number() 解析为数字时直接 return false）。
            // 原理：输入数字时 shouldAutoTrigger 返回 false，触发字符分支不会被提前 return，
            // 于是按刚输入的字符查表命中本 provider，补全下拉正常弹出；
            // 输入字母时 shouldAutoTrigger 返回 true，触发字符分支让位，
            // 仍走原有 quickSuggestions 流程，行为完全不变。
            triggerCharacters: Array.from({ length: 10 }, (_, i) => String(i)),
            provideCompletionItems: (model, position) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };
                // Monaco 会自动按已输入的前缀过滤这份列表，无需手写匹配逻辑
                return {
                    suggestions: suggestions.map(text => ({
                        label: text,
                        kind: monaco.languages.CompletionItemKind.Text,
                        insertText: text,
                        range,
                    })),
                };
            },
        });
    }

    onMount(() => {
        // 注册一个自定义纯文本语言，避免依赖内置语言的额外注册
        monaco.languages.register({ id: LANGUAGE_ID });
        registerCompletion();

        editor = monaco.editor.create(containerEl, {
            value,
            language: LANGUAGE_ID,
            readOnly,
            automaticLayout: true, // 容器尺寸变化时自动重排，省去手动 resize
            fixedOverflowWidgets: true,
            minimap: { enabled: false },
            lineNumbers: 'off',
            glyphMargin: false,
            folding: false,
            scrollBeyondLastLine: false,
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            contextmenu: false,
            // 纯文本补全场景：输入即触发建议
            quickSuggestions: true,
            // 必须为 true，provider 声明的 triggerCharacters 才会生效（见 suggestModel.js _updateTriggerCharacters）
            suggestOnTriggerCharacters: true,
        });

        editor.onDidChangeModelContent(() => {
            if (isInternalChange) return; // 忽略由 setValue 触发的变化
            const content = editor.getValue();
            contentBackup = content;
            value = content;
            dispatch('input', content);
        });

        if (onKeyDown) {
            containerEl.addEventListener('keydown', onKeyDown);
        }

        // 二次打开编辑器时，初始 value 可能包含 span 标签
        // 此时 contentBackup === value，watcher 不会触发，需要在这里主动处理
        if (value && value.includes('<span class="sc-')) {
            isInternalChange = true;
            parseAndApplySpans();
            isInternalChange = false;
            // 同步 contentBackup 为 value（带标签文本），避免 watcher 误触发
            contentBackup = value;
        }
    });

    onDestroy(() => {
        completionDisposable?.dispose();
        editor?.dispose();
        editor = null;
    });

    // 外部 value 变化时同步进编辑器，并解析 span 标签
    $: if (editor && value !== contentBackup) {
        isInternalChange = true;
        editor.setValue(value ?? '');
        contentBackup = value;
        // 解析文本中的 span 标签并应用为装饰
        parseAndApplySpans();
        isInternalChange = false;
    }

    // 候选列表变化时重新注册补全
    $: if (editor && suggestions) {
        registerCompletion();
    }

    export function getEditor() {
        return editor;
    }
    export function focus() {
        editor?.focus();
    }

    export function applyRedHighlight(range: any) {
        if (!editor) return;
        const decorations = editor.deltaDecorations([], [{
            range,
            options: {
                inlineClassName: 'dbgate-red-text',
            },
        }]);
        return decorations;
    }

    export function clearRedHighlight(decorationIds: string[]) {
        if (!editor) return;
        editor.deltaDecorations(decorationIds, []);
    }

    /**
     * 将纯净文本偏移映射到带标签文本偏移
     * 遍历带标签文本，同步追踪两种文本的位置，建立映射表
     * 例如: taggedText = "Hello <span class=\"sc-red\">World</span> Foo"
     *        cleanOffset 6 ("W" in clean text) → taggedOffset 27 ("W" in tagged text)
     */
    function mapCleanToTagged(taggedText: string, cleanOffsets: number[]): Map<number, number> {
        const result = new Map<number, number>();
        const needed = new Set(cleanOffsets);
        if (needed.size === 0) return result;

        const spanRegex = /<span class="sc-([a-z]+)">([\s\S]*?)<\/span>/g;
        let cleanPos = 0;
        let taggedPos = 0;
        let match;

        while ((match = spanRegex.exec(taggedText)) !== null) {
            // 处理 span 之前的普通文本
            const beforeLen = match.index - taggedPos;
            for (let i = 0; i < beforeLen; i++) {
                if (needed.has(cleanPos)) {
                    result.set(cleanPos, taggedPos);
                }
                cleanPos++;
                taggedPos++;
            }

            // 处理 span 标签
            const openTagEnd = taggedPos + match[0].indexOf('>') + 1; // '<span class="sc-xxx">' 结束位置
            const content = match[2];

            // 映射 span 内容区域的每个字符位置
            // span 结束位置（cleanPos = span.endOffset）由下方"剩余普通文本"循环处理
            for (let i = 0; i < content.length; i++) {
                if (needed.has(cleanPos)) {
                    if (i === 0) {
                        result.set(cleanPos, openTagEnd); // span 内容开头 → 紧跟开放标签之后
                    } else {
                        result.set(cleanPos, openTagEnd + i);
                    }
                }
                cleanPos++;
            }

            taggedPos = match.index + match[0].length; // 跳到 </span> 之后
        }

        // 处理剩余普通文本（包括 span 结束位置 cleanPos = span.endOffset）
        while (cleanPos < taggedText.length) {
            if (needed.has(cleanPos)) {
                result.set(cleanPos, taggedPos);
            }
            cleanPos++;
            taggedPos++;
        }

        return result;
    }

    /**
     * 将选中文本包裹在指定颜色的 span 标签中
     * 核心逻辑：在 value（已包含所有旧 span 标签）上操作，
     * 而非在编辑器的纯净文本上操作，确保旧 span 标签不丢失。
     */
    export function wrapSelectionWithColor(colorName: string) {
        if (!editor) return;
        const selection = editor.getSelection();
        if (!selection || selection.isEmpty()) return;

        const model = editor.getModel();
        const selectedText = model.getValueInRange(selection);

        // 获取编辑器中的纯净文本和选区位置
        const cleanText = model.getValue();
        const startOffset = model.getOffsetAt(selection.getStartPosition());
        const endOffset = model.getOffsetAt(selection.getEndPosition());

        // 获取包含所有旧 span 标签的完整文本
        const currentTaggedText = value ?? '';

        let newTaggedText: string;

        if (currentTaggedText && currentTaggedText.includes('<span class="sc-')) {
            // 有旧 span 标签 → 需要将纯净文本偏移映射到带标签文本的偏移
            const offsetMap = mapCleanToTagged(currentTaggedText, [startOffset, endOffset]);
            const taggedStart = offsetMap.get(startOffset) ?? startOffset;
            const taggedEnd = offsetMap.get(endOffset) ?? endOffset;

            newTaggedText =
                currentTaggedText.substring(0, taggedStart) +
                `<span class="sc-${colorName}">${selectedText}</span>` +
                currentTaggedText.substring(taggedEnd);
        } else {
            // 没有旧 span 标签 → 直接在纯净文本上插入
            newTaggedText =
                cleanText.substring(0, startOffset) +
                `<span class="sc-${colorName}">${selectedText}</span>` +
                cleanText.substring(endOffset);
        }

        // 阻止 onDidChangeModelContent 同步到外部
        isInternalChange = true;

        // 将完整的带标签文本设置到编辑器
        editor.setValue(newTaggedText);

        // 解析所有 span 标签并应用装饰（包括旧的和新的）
        parseAndApplySpans();

        // 同步更新本地 value 和 contentBackup，防止 watcher 误触发
        value = newTaggedText;
        contentBackup = newTaggedText;

        // 将带标签文本同步到外部
        dispatch('input', newTaggedText);

        // 所有操作完成后才允许外部同步
        isInternalChange = false;
    }

    /**
     * 从带 span 标签的文本中提取纯净文本和 span 位置信息
     * 例如: "Hello <span class=\"sc-red\">World</span> Foo"
     * 返回: { cleanText: "Hello World Foo", spans: [{startOffset: 6, endOffset: 11, color: 'red'}] }
     */
    function stripSpanTags(text: string): { cleanText: string; spans: SpanInfo[] } {
        const spans: SpanInfo[] = [];
        // 通用正则：匹配任意 sc-{color} 格式的 span 标签
        const spanRegex = /<span class="sc-([a-z]+)">([\s\S]*?)<\/span>/g;
        let result = '';
        let lastIndex = 0;
        let match;
        
        while ((match = spanRegex.exec(text)) !== null) {
            // 添加 span 标签之前的文本
            result += text.substring(lastIndex, match.index);
            
            // 记录 span 内容在纯净文本中的位置和颜色
            const currentLength = result.length;
            spans.push({
                startOffset: currentLength,
                endOffset: currentLength + match[2].length,
                color: match[1],  // 提取颜色名称
            });
            
            // 添加 span 内部的文本（不含标签）
            result += match[2];
            lastIndex = match.index + match[0].length;
        }
        
        // 添加剩余的文本
        result += text.substring(lastIndex);
        
        return { cleanText: result, spans };
    }
    
    /**
     * 解析文本中的 span 标签，提取纯净文本并应用装饰
     * 注意：此函数不管理 isInternalChange 标志，由调用者负责
     */
    export function parseAndApplySpans() {
        if (!editor) return;
        
        const model = editor.getModel();
        if (!model) return;
        
        const fullText = model.getValue();
        
        // 如果文本中没有 sc- 开头的 span 标签，直接返回
        if (!fullText.includes('<span class="sc-')) {
            spanInfos = [];
            return;
        }
        
        // 提取纯净文本和 span 位置
        const { cleanText, spans } = stripSpanTags(fullText);
        spanInfos = spans;
        
        // 使用 setValue 替换内容（调用者需确保 isInternalChange = true）
        editor.setValue(cleanText);
        
        // 在纯净文本上应用对应颜色的装饰
        const decorations: any[] = spans.map(span => ({
            range: new monaco.Range(
                model.getPositionAt(span.startOffset).lineNumber,
                model.getPositionAt(span.startOffset).column,
                model.getPositionAt(span.endOffset).lineNumber,
                model.getPositionAt(span.endOffset).column
            ),
            options: {
                inlineClassName: `sc-${span.color}`,
            },
        }));
        
        if (decorations.length > 0) {
            editor.deltaDecorations([], decorations);
        }
    }
</script>

<div class="monaco-cell-editor" bind:this={containerEl}></div>

<style>
    .monaco-cell-editor {
        position: absolute;
        left: 0;
        top: 0;
        right: 0;
        bottom: 0;
    }

    :global(.sc-gray) { color: #808080 !important; }
    :global(.sc-brown) { color: #A0522D !important; }
    :global(.sc-orange) { color: #E67E22 !important; }
    :global(.sc-yello) { color: #F1C40F !important; }
    :global(.sc-green) { color: #27AE60 !important; }
    :global(.sc-blue) { color: #2980B9 !important; }
    :global(.sc-purple) { color: #8E44AD !important; }
    :global(.sc-pink) { color: #E91E8C !important; }
    :global(.sc-red) { color: #E74C3C !important; }
    :global(.sc-black) { color: #2C3E50 !important; }
</style>