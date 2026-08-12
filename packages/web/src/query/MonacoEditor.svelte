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
    
    // 存储 span 标签的位置信息，用于在纯净文本上重新应用装饰
    interface SpanInfo {
        startOffset: number;  // 在纯净文本中的起始位置
        endOffset: number;    // 在纯净文本中的结束位置
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
        if (value && value.includes('<span class="dbgate-red-text">')) {
            parseAndApplySpans();
            // 同步 contentBackup 为纯净文本，避免 watcher 误触发
            contentBackup = editor.getValue();
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
     * 从带 span 标签的文本中提取纯净文本和 span 位置信息
     * 例如: "Hello <span class=\"dbgate-red-text\">World</span> Foo"
     * 返回: { cleanText: "Hello World Foo", spans: [{startOffset: 6, endOffset: 11}] }
     */
    function stripSpanTags(text: string): { cleanText: string; spans: SpanInfo[] } {
        const spans: SpanInfo[] = [];
        const spanRegex = /<span class="dbgate-red-text">([\s\S]*?)<\/span>/g;
        let result = '';
        let lastIndex = 0;
        let match;
        
        while ((match = spanRegex.exec(text)) !== null) {
            // 添加 span 标签之前的文本
            result += text.substring(lastIndex, match.index);
            
            // 记录 span 内容在纯净文本中的位置
            const currentLength = result.length;
            spans.push({
                startOffset: currentLength,
                endOffset: currentLength + match[1].length,
            });
            
            // 添加 span 内部的文本（不含标签）
            result += match[1];
            lastIndex = match.index + match[0].length;
        }
        
        // 添加剩余的文本
        result += text.substring(lastIndex);
        
        return { cleanText: result, spans };
    }
    
    /**
     * 解析文本中的 span 标签，提取纯净文本并应用装饰
     */
    export function parseAndApplySpans() {
        if (!editor) return;
        
        const model = editor.getModel();
        if (!model) return;
        
        const fullText = model.getValue();
        
        // 如果文本中没有 span 标签，直接返回
        if (!fullText.includes('<span class="dbgate-red-text">')) {
            spanInfos = [];
            return;
        }
        
        // 提取纯净文本和 span 位置
        const { cleanText, spans } = stripSpanTags(fullText);
        spanInfos = spans;
        
        // 如果纯净文本与当前编辑器内容不同，更新编辑器
        const currentText = editor.getValue();
        if (currentText !== cleanText) {
            isInternalChange = true;
            editor.setValue(cleanText);
            isInternalChange = false;
        }
        
        // 在纯净文本上应用红色装饰
        const decorations: any[] = spans.map(span => ({
            range: new monaco.Range(
                model.getPositionAt(span.startOffset).lineNumber,
                model.getPositionAt(span.startOffset).column,
                model.getPositionAt(span.endOffset).lineNumber,
                model.getPositionAt(span.endOffset).column
            ),
            options: {
                inlineClassName: 'dbgate-red-text',
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

    :global(.dbgate-red-text) {
        color: #e74c3c !important;
    }
</style>