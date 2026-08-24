<script lang="ts">
  // 移动端专用：就地编辑（InplaceInput）的自动补全下拉浮层。
  // PC 端 InplaceInput 不渲染此组件（isMbView 为 false），零影响。
  //
  // 定位策略（与 MbCellSuggest / MbScreen 长按菜单同一套 iOS 安全模式）：
  // 浮层通过 portal 挂在 document.body 下、position:absolute 文档坐标定位，
  // 不用 position:fixed —— iOS 键盘弹起时视觉视口与布局视口错位，fixed 会漂移。
  // 锚定 input 下缘；下方空间不足（iOS 键盘占屏）时向上翻转；水平钳制在视口内。
  // 可见高度按 visualViewport 计算，感知键盘挤压后的真实可视范围。
  //
  // 点选（iOS touch tap 检测，详见下方候选项事件注释）：touchend 判定 tap 时
  // preventDefault 阻止焦点转移，input 不失焦、编辑器不被 blur 提前关闭。
  import { onMount, onDestroy } from 'svelte';
  // 与 MbCellSuggest 同款模糊匹配：vscode-fuzzy-scorer 的 scoreFuzzy，
  // 连续性加权天然实现三层优先级（连续匹配 > 跳过分隔符 > 跨字符模糊）
  import { scoreFuzzy } from 'vscode-fuzzy-scorer';

  export let domInput: HTMLInputElement;
  export let suggestions: string[] = [];
  export let onPick: (value: string) => void;

  let visible = false;
  let items: string[] = [];
  let left = 0;
  let top = 0;
  let maxHeight = 150;
  let maxWidth = 240;

  let domPortal: HTMLDivElement;

  const MAX_LIST_HEIGHT = 150;
  const MAX_LIST_WIDTH = 240;
  const MIN_LIST_HEIGHT = 44;

  function hide() {
    visible = false;
  }

  // 与 MbCellSuggest 的差异：就地编辑是单值场景，query 取 input 整值而非光标单词；
  // 空值时展示全部候选 —— 移动端主用法是直接点选录入，不强制先输入字符
  function refresh() {
    if (!domInput) return;
    if (!suggestions || suggestions.length === 0) return hide();

    const query = (domInput.value ?? '').trim();
    if (!query) {
      items = suggestions.slice(0, 100);
    } else {
      const queryLower = query.toLowerCase();
      const scored = suggestions
        .map(s => {
          const res = scoreFuzzy(s, query, queryLower, true);
          return { item: s, score: res ? res[0] : 0 };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score);
      if (scored.length === 0) return hide();
      items = scored.slice(0, 100).map(x => x.item);
    }

    positionDropdown();
    visible = true;
  }

  function positionDropdown() {
    const rect = domInput.getBoundingClientRect();
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;

    // input 的文档坐标（body 浮层的定位基准）
    const docLeft = rect.left + scrollX;
    const docTop = rect.top + scrollY;
    const docBottom = docTop + rect.height;

    // 可视区上下边（文档坐标）：iOS 键盘弹起时布局视口 innerHeight 不变，
    // visualViewport.height/offsetTop 才反映键盘上方的真实可视范围
    const vv = window.visualViewport;
    const viewportTopDoc = vv ? vv.offsetTop + scrollY : scrollY;
    const viewportBottomDoc = vv ? vv.offsetTop + vv.height + scrollY : window.innerHeight + scrollY;

    maxWidth = Math.max(120, Math.min(MAX_LIST_WIDTH, window.innerWidth - 16));

    const spaceBelow = viewportBottomDoc - docBottom;
    const spaceAbove = docTop - viewportTopDoc;
    if (spaceBelow >= MIN_LIST_HEIGHT) {
      // 正常情况：input 下方弹出
      top = docBottom + 2;
      maxHeight = Math.max(MIN_LIST_HEIGHT, Math.min(spaceBelow - 2, MAX_LIST_HEIGHT));
    } else if (spaceAbove >= MIN_LIST_HEIGHT) {
      // 下方空间不足（键盘占屏）：向上翻转
      maxHeight = Math.max(MIN_LIST_HEIGHT, Math.min(spaceAbove - 2, MAX_LIST_HEIGHT));
      top = docTop - 2 - maxHeight;
    } else {
      // 上下都放不下（极端小屏）：仍放下方，给最小高度
      top = docBottom + 2;
      maxHeight = MIN_LIST_HEIGHT;
    }

    // 水平钳制：左缘距视口左 ≥8px，右缘不超出视口右
    const viewportLeftDoc = scrollX;
    const viewportRightDoc = scrollX + window.innerWidth;
    left = Math.min(
      Math.max(docLeft, viewportLeftDoc + 8),
      Math.max(viewportLeftDoc + 8, viewportRightDoc - maxWidth - 8)
    );
  }

  // ===== 候选项点选（touch 事件原生 tap 检测）=====
  // 前两版失败教训：pointer 事件不可用——iOS 上（含 Chrome，同为 WebKit 内核）
  // pointerdown 的 preventDefault 会干扰该触摸后续 pointer 事件的派发
  // （实测 pointerup 上的选中逻辑从未执行），click 又被同一 preventDefault
  // 取消合成，导致点击候选完全无反应。
  // 本版换用 iOS 底层 touch 事件（不受浏览器触摸优化/合成管线干扰）：
  // touchstart 记录按压（不 preventDefault，保列表滚动）→ touchmove 位移超
  // 阈值清除按压（滚动中）→ touchend 判定 tap 时 preventDefault（阻止合成
  // mousedown/click，从而阻止焦点转移——input 不 blur、编辑器不提前关闭）
  // 并直接选中提交。
  let pressItem: string | null = null;
  let pressX = 0;
  let pressY = 0;
  const TAP_SLOP = 10;

  function handleItemTouchStart(event: TouchEvent, item: string) {
    if (event.touches.length !== 1) {
      // 多指触摸不作为点选
      pressItem = null;
      return;
    }
    pressItem = item;
    pressX = event.touches[0].clientX;
    pressY = event.touches[0].clientY;
  }

  function handleItemTouchMove(event: TouchEvent) {
    if (!pressItem) return;
    if (
      event.touches.length === 1 &&
      Math.abs(event.touches[0].clientX - pressX) <= TAP_SLOP &&
      Math.abs(event.touches[0].clientY - pressY) <= TAP_SLOP
    ) {
      return;
    }
    // 手指拖动（滚动列表）或多指：放弃本次按压
    pressItem = null;
  }

  function handleItemTouchEnd(event: TouchEvent) {
    const item = pressItem;
    pressItem = null;
    if (!item || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    // 位移超过阈值视为滚动列表而非点选
    if (Math.abs(touch.clientX - pressX) > TAP_SLOP || Math.abs(touch.clientY - pressY) > TAP_SLOP) return;
    // tap 判定成立：阻止合成 mousedown/click（防焦点转移 + 防重复触发）后直接选中
    event.preventDefault();
    accept(item);
  }

  function handleItemTouchCancel() {
    // 拖动被浏览器接管为滚动手势，放弃本次按压
    pressItem = null;
  }

  // 鼠标通道（外接鼠标/桌面调试）兜底：mousedown preventDefault 不阻止同序列
  // 后续 click 的派发（与 pointerdown 不同），防失焦 + click 选中可并存——
  // 这正是 MbCellSuggest 在模态框内已验证的方案。touch 通道选中后若某环境
  // click 仍到达，500ms 时间窗去重防二次提交。
  let lastPickAt = 0;

  function handleItemClick(item: string) {
    if (Date.now() - lastPickAt < 500) return;
    accept(item);
  }

  function accept(item: string) {
    lastPickAt = Date.now();
    hide();
    onPick?.(item);
  }

  onMount(() => {
    document.body.appendChild(domPortal);
    domInput.addEventListener('input', refresh);
    refresh();
  });

  onDestroy(() => {
    domInput?.removeEventListener('input', refresh);
    domPortal?.remove();
  });

  // 候选异步加载完成后重新计算
  $: if (suggestions) {
    refresh();
  }
</script>

<div bind:this={domPortal} class="mb-inplace-suggest-portal">
  {#if visible}
    <div
      class="mb-inplace-suggest"
      style="left: {left}px; top: {top}px; max-height: {maxHeight}px; max-width: {maxWidth}px;"
      data-testid="MbInplaceSuggest_dropdown"
    >
      {#each items as item}
        <button
          type="button"
          class="mb-inplace-suggest-item"
          data-testid="MbInplaceSuggest_item"
          on:touchstart={event => handleItemTouchStart(event, item)}
          on:touchmove={handleItemTouchMove}
          on:touchend={event => handleItemTouchEnd(event)}
          on:touchcancel={handleItemTouchCancel}
          on:mousedown|preventDefault={() => {/* 鼠标通道防失焦（外接鼠标/桌面调试） */}}
          on:click={() => handleItemClick(item)}
        >
          {item}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* portal：0 尺寸锚点挂在 body 文档原点，内部浮层用文档坐标 absolute 定位 */
  .mb-inplace-suggest-portal {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    overflow: visible;
  }

  .mb-inplace-suggest {
    position: absolute;
    z-index: 1000;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    /* body 层浮层直接暴露在页面：长按候选项不触发系统文本选择/呼出菜单 */
    user-select: none;
    -webkit-touch-callout: none;
    /* 固定亮灰背景（不用主题变量：深色主题的 --theme-background-2 ≈#2D2D30
       与 #484848 的网格背景几乎无对比，用户实测反馈太暗）；比编辑器背景亮
       一档的中性灰，深色环境下醒目但不刺眼 */
    background-color: #66666a;
    border: 1px solid #8a8a90;
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }

  .mb-inplace-suggest-item {
    display: block;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: #f2f2f2;
    font-size: 14px;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    touch-action: manipulation;
  }

  .mb-inplace-suggest-item:active {
    /* 按压反馈：比浮层背景再亮一档 */
    background-color: #7d7d84;
  }
</style>
