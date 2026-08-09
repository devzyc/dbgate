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

    function registerCompletion() {
        // 先注销旧的，避免重复注册
        completionDisposable?.dispose();

        completionDisposable = monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
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
            suggestOnTriggerCharacters: true,
        });

        editor.onDidChangeModelContent(() => {
            const content = editor.getValue();
            contentBackup = content;
            value = content;
            dispatch('input', content);
        });

        if (onKeyDown) {
            containerEl.addEventListener('keydown', onKeyDown);
        }
    });

    onDestroy(() => {
        completionDisposable?.dispose();
        editor?.dispose();
        editor = null;
    });

    // 外部 value 变化时同步进编辑器
    $: if (editor && value !== contentBackup) {
        editor.setValue(value ?? '');
        contentBackup = value;
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
</style>