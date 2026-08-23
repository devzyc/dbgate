<script lang="ts">
  // 移动端专用自动补全下拉（PC 端 isMbView 为 false，永不渲染此组件，零影响）。
  //
  // 为什么不复用 Monaco 原生 suggest widget：
  // iOS Safari 软键盘弹起时视觉视口与布局视口错位，原生 widget 依赖的
  // fixedOverflowWidgets（position: fixed）定位会漂到屏幕顶部（浏览器地址栏下方）。
  // 本组件改用相对编辑器容器的绝对定位（定位上下文为 EditCellDataModal 的
  // .editor，position: relative），直接锚定在光标下方弹出；
  // 空间不足时向上翻转，但钳制在编辑器顶边以内，不会遮挡编辑器上方的调色板。
  import { onMount } from 'svelte';

  export let editor: any = null;
  export let suggestions: string[] = [];

  let visible = false;
  let items: string[] = [];
  let left = 0;
  let top = 0;
  let maxHeight = 150;
  let maxWidth = 220;
  // 当前正在补全的单词范围，点选候选时用于替换
  let wordRange: any = null;

  onMount(() => {
    if (!editor) return;
    // 防御性注册：使用 ?. 避免未来 monaco 版本差异导致 undefined 方法崩溃。
    // 注意 monaco 0.45 只有 onDidBlurEditorText / onDidBlurEditorWidget（无 TextWidget 组合名）；
    // 事件监听随编辑器 dispose 一并销毁，无需手动反注册
    editor.onDidChangeModelContent?.(refresh);
    editor.onDidChangeCursorPosition?.(refresh);
    editor.onDidBlurEditorWidget?.(hide);
    // 编辑器已就绪且有内容时，主动刷新一次（覆盖挂载晚于内容写入的场景）
    refresh();
  });

  function hide() {
    visible = false;
  }

  function refresh() {
    if (!editor) return hide();
    const model = editor.getModel();
    const position = editor.getPosition();
    if (!model || !position) return hide();

    const word = model.getWordUntilPosition(position);
    wordRange = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };

    const prefix = (word.word ?? '').toLowerCase();
    if (!prefix) return hide();

    // 优先前缀匹配（如 kin -> KING），无命中时退化为包含匹配；排除与已输入内容完全相同的候选
    let matches = suggestions.filter(s => s.toLowerCase().startsWith(prefix) && s.toLowerCase() !== prefix);
    if (matches.length === 0) {
      matches = suggestions.filter(s => s.toLowerCase().includes(prefix) && s.toLowerCase() !== prefix);
    }
    if (matches.length === 0) return hide();
    items = matches.slice(0, 100);

    positionDropdown(position);
    visible = true;
  }

  function positionDropdown(position) {
    // getScrolledVisiblePosition 返回相对编辑器 DOM 左上角、已含滚动偏移的坐标，
    // 与 .editor 定位上下文一致，无需 viewport/fixed 换算，天然规避 iOS 键盘视口错位问题
    const coords = editor.getScrolledVisiblePosition(position);
    if (!coords) return;
    const domNode = editor.getDomNode();
    const containerWidth = domNode?.clientWidth ?? 300;
    const containerHeight = domNode?.clientHeight ?? 200;
    const lineHeight = coords.height || 19;

    left = Math.max(0, Math.min(coords.left, containerWidth - 60));
    maxWidth = Math.max(80, Math.min(containerWidth - left - 4, 220));

    const spaceBelow = containerHeight - (coords.top + lineHeight);
    if (spaceBelow >= 36) {
      // 正常情况：光标下方弹出
      top = coords.top + lineHeight + 2;
      maxHeight = Math.max(36, Math.min(spaceBelow - 2, 150));
    } else {
      // 下方空间不足：向上翻转；钳制在编辑器顶边（top >= 0），
      // 保证不会遮挡编辑器上方的颜色调色板
      maxHeight = Math.max(36, Math.min(coords.top - 2, 150));
      top = Math.max(0, coords.top - 2 - maxHeight);
    }
  }

  function accept(item: string) {
    if (!editor || !wordRange) return;
    // 用候选值替换当前单词；随后的内容变化事件会再次 refresh，
    // 因完全匹配项已被过滤，下拉自动收起
    editor.executeEdits('mb-cell-suggest', [{ range: wordRange, text: item }]);
    hide();
    editor.focus();
  }
</script>

{#if visible}
  <div
    class="mb-cell-suggest"
    style="left: {left}px; top: {top}px; max-height: {maxHeight}px; max-width: {maxWidth}px;"
    data-testid="MbCellSuggest_dropdown"
  >
    {#each items as item}
      <button
        type="button"
        class="mb-suggest-item"
        data-testid="MbCellSuggest_item"
        on:mousedown|preventDefault={() => accept(item)}
        on:click={() => accept(item)}
      >
        {item}
      </button>
    {/each}
  </div>
{/if}

<style>
  .mb-cell-suggest {
    position: absolute;
    z-index: 1000;
    overflow-y: auto;
    background-color: var(--theme-background-2, #252526);
    border: 1px solid var(--theme-modal-border, #454545);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    -webkit-overflow-scrolling: touch;
  }

  .mb-suggest-item {
    display: block;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: inherit;
    font-size: 14px;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    touch-action: manipulation;
  }

  .mb-suggest-item:active {
    background-color: var(--theme-hover, #094771);
  }
</style>
