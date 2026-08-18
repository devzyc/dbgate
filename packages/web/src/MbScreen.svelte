<script>
  // 移动端专用副本组件链（MbWidgetContainer → MbDatabaseWidget →
  // MbDatabaseWidgetDetailContent → MbSqlObjectList）：
  // 移动端页面跳转信号只存在于该副本链中，PC 端的 WidgetContainer 等共用组件保持原样。
  import { onMount } from 'svelte';
  import MbSchemaList from './widgets/MbSchemaList.svelte';
  import MbTableList from './widgets/MbTableList.svelte';
  import MbWidgetContainer from './widgets/MbWidgetContainer.svelte';
  import WidgetIconPanel from './widgets/WidgetIconPanel.svelte';
  import {
    activeTab,
    currentDatabase,
    isFileDragActive,
    openedConnections,
    openedSnackbars,
    openedTabs,
    selectedWidget,
    visibleCommandPalette,
    visibleWidgetSideBar,
  } from './stores';
  import { openTableRequestSignal, openTabRequestSignal } from './mbStores';
  import CommandPalette from './commands/CommandPalette.svelte';
  import CurrentDropDownMenu from './modals/CurrentDropDownMenu.svelte';
  import StatusBar from './widgets/StatusBar.svelte';
  import Snackbar from './widgets/Snackbar.svelte';
  import ModalLayer from './modals/ModalLayer.svelte';
  import DragAndDropFileTarget from './DragAndDropFileTarget.svelte';
  import dragDropFileTarget from './utility/dragDropFileTarget';
  import FontIcon from './icons/FontIcon.svelte';
  import getElectron from './utility/getElectron';
  import MultiTabsContainer from './tabpanel/MultiTabsContainer.svelte';
  import { currentThemeType } from './plugins/themes';

  $: currentThemeTypeClass = $currentThemeType == 'dark' ? 'theme-type-dark' : 'theme-type-light';

  const isElectron = !!getElectron();

  // 移动端双页面结构：
  // - 列表页（list-page）：Schemas 列表 或 Tables 列表，占满整屏
  // - 数据页（data-page）：顶部返回导航 + 数据表内容（MultiTabsContainer），占满整屏
  // 两个页面始终挂载，仅用 display 切换，避免切页时卸载导致表树展开状态
  // 或数据网格重新查询。
  let isDataPage = false;
  // 信号基线：返回列表页时记录当前计数，用户再次点击表（计数 +1）才跳转数据页，
  // 保证点击已打开过的表也能进入数据页。
  let signalBaseline = 0;

  // 列表页内导航：selectedDatabase 为 null 时显示 Schemas 列表（MbSchemaList），
  // 有值时显示该数据库下的 Tables 列表（MbTableList）。
  // 与 $currentDatabase 解耦：currentDatabase 表示连接级选中状态，
  // selectedDatabase 表示用户在列表页内显式点入了哪个数据库。
  let selectedDatabase = null;

  // 判断 currentDatabase 引用的连接是否实际已打开：
  // currentDatabase 从 localStorage 恢复（writableWithStorage），但浏览器返回/前进
  // 或刷新时连接并未重新建立，此时 openedConnections 为空，需回退到连接管理 UI。
  $: currentDatabaseConnectionOpen =
    $currentDatabase?.connection?._id != null &&
    $openedConnections.includes($currentDatabase.connection._id);

  // 列表页中用户点击了表对象，或打开了非表类 tab（如新建连接）→ 进入数据页
  $: if (!isDataPage && $openTableRequestSignal + $openTabRequestSignal > signalBaseline) {
    isDataPage = true;
  }

  // 数据页中所有 tab 被关闭 → 自动回到列表页
  $: if (isDataPage && (!$openedTabs || $openedTabs.length == 0)) {
    isDataPage = false;
    signalBaseline = $openTableRequestSignal + $openTabRequestSignal;
  }

  // 连接成功后自动关闭 ConnectionTab 并跳转到列表页（显示 Schemas 列表）
  // 监听 $openedConnections 新增连接（而非 $currentDatabase，因为新连接可能无 defaultDatabase）
  let prevOpenedConIds = new Set($openedConnections);
  $: {
    const newConIds = new Set($openedConnections);
    const newlyOpened = [...newConIds].filter(id => !prevOpenedConIds.has(id));
    if (newlyOpened.length > 0) {
      // 有连接刚打开 → 关闭当前 ConnectionTab（如果有）
      if (isDataPage && $activeTab?.tabComponent == 'ConnectionTab') {
        openedTabs.update(tabs =>
          tabs.map(t => (t.tabid == $activeTab.tabid ? { ...t, closedTime: new Date().toISOString() } : t))
        );
      }
      // 跳转到列表页（MbSchemaList 会因 conid 有值而显示数据库列表）
      isDataPage = false;
      signalBaseline = $openTableRequestSignal + $openTabRequestSignal;
    }
    prevOpenedConIds = newConIds;
  }

  function goBackToList() {
    isDataPage = false;
    // 重置基线，保证下次点击（包括已打开过的表/连接 tab）仍能跳转到数据页
    signalBaseline = $openTableRequestSignal + $openTabRequestSignal;
  }

  // 列表页内从 Tables 列表返回 Schemas 列表
  function goBackToSchemas() {
    selectedDatabase = null;
  }

  // ---- 移动端数据网格触摸手势 ----
  // DataGridCore 的列/行滚动由 wheel 事件驱动（on:wheel|nonpassive → handleGridWheel →
  // scrollHorizontal/scrollVertical），但手机上没有 wheel 事件，触摸滑动在虚拟列渲染下
  // 也无原生滚动余量（内容宽＝可见列宽），导致只能看到前几列。
  // 这里在数据网格区域（.tableScrollContainer）上跟踪单指滑动，合成 WheelEvent 派发，
  // 复用 PC 的滚轮路径驱动虚拟列/行滚动。仅移动端文件生效，PC 端零影响。
  let gridTouchId = null;
  let gridTouchLastX = 0;
  let gridTouchLastY = 0;

  function isGridTouchTarget(target) {
    if (!(target instanceof Element)) return false;
    const dataPage = document.querySelector('[data-testid="MbScreen_dataPage"]');
    if (!dataPage) return false;
    const scrollContainer = dataPage.querySelector('.tableScrollContainer');
    return !!scrollContainer && scrollContainer.contains(target);
  }

  function handleGridTouchStart(e) {
    if (gridTouchId != null) return;
    if (e.touches.length != 1) return;
    if (!isGridTouchTarget(e.target)) return;
    gridTouchId = e.touches[0].identifier;
    gridTouchLastX = e.touches[0].clientX;
    gridTouchLastY = e.touches[0].clientY;
  }

  function handleGridTouchMove(e) {
    if (gridTouchId == null) return;
    const touch = Array.from(e.touches).find(x => x.identifier == gridTouchId);
    if (!touch) return;
    const dx = touch.clientX - gridTouchLastX;
    const dy = touch.clientY - gridTouchLastY;
    gridTouchLastX = touch.clientX;
    gridTouchLastY = touch.clientY;
    if (dx == 0 && dy == 0) return;
    try {
      // 手指右滑（dx>0）→ deltaX 为负 → 列左移，与触控板自然滚动方向一致
      e.target.dispatchEvent(
        new WheelEvent('wheel', {
          deltaX: -dx,
          deltaY: -dy,
          deltaMode: 0,
          bubbles: true,
          cancelable: true,
        })
      );
    } catch {
      // WheelEvent 构造器在旧版浏览器不可用时静默忽略
    }
  }

  function handleGridTouchEnd(e) {
    if (gridTouchId == null) return;
    if (Array.from(e.touches).some(x => x.identifier == gridTouchId)) return;
    gridTouchId = null;
  }

  onMount(() => {
    document.addEventListener('touchstart', handleGridTouchStart, { passive: true });
    document.addEventListener('touchmove', handleGridTouchMove, { passive: true });
    document.addEventListener('touchend', handleGridTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleGridTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleGridTouchStart);
      document.removeEventListener('touchmove', handleGridTouchMove);
      document.removeEventListener('touchend', handleGridTouchEnd);
      document.removeEventListener('touchcancel', handleGridTouchEnd);
    };
  });
</script>

<div
  class={`${currentThemeTypeClass} root dbgate-screen`}
  class:isElectron
  use:dragDropFileTarget
  on:contextmenu={e => e.preventDefault()}
>
  <!-- 列表页：已选数据库或有已打开连接时显示 Schemas/Tables 列表，否则显示原连接管理 UI -->
  <div class="list-page" class:hidden={isDataPage} data-testid="MbScreen_listPage">
    {#if currentDatabaseConnectionOpen || $openedConnections.length > 0}
      {#if selectedDatabase}
        <!-- Tables 列表页：顶部返回按钮 + 表列表 -->
        <div class="table-list-page">
          <div class="table-list-header">
            <div class="back-button" on:pointerup={goBackToSchemas} data-testid="MbScreen_backToSchemas">
              <FontIcon icon="icon arrow-left" />
            </div>
            <div class="table-list-title">{selectedDatabase}</div>
          </div>
          <MbTableList conid={$currentDatabase?.connection?._id ?? $openedConnections[0]} database={selectedDatabase} />
        </div>
      {:else}
        <MbSchemaList on:selectDatabase={(e) => { selectedDatabase = e.detail; }} />
      {/if}
    {:else}
      <div class="iconbar">
        <WidgetIconPanel />
      </div>
      {#if $selectedWidget && $visibleWidgetSideBar}
        <div class="leftpanel">
          <MbWidgetContainer />
        </div>
      {/if}
    {/if}
  </div>

  <!-- 数据页：顶部返回导航 + 数据表内容 -->
  <div class="data-page" class:hidden={!isDataPage} data-testid="MbScreen_dataPage">
    <div class="data-header">
      <div class="back-button" on:click={goBackToList} data-testid="MbScreen_backToList">
        <FontIcon icon="icon arrow-left" />
      </div>
      <div class="data-title">{($activeTab && $activeTab.title) || ''}</div>
    </div>
    <div class="tabs-container">
      <MultiTabsContainer />
    </div>
  </div>

  <div class="statusbar">
    <StatusBar />
  </div>
  {#if $visibleCommandPalette}
    <div class="commads">
      <CommandPalette />
    </div>
  {/if}
  <CurrentDropDownMenu />
  <ModalLayer />
  {#if $isFileDragActive}
    <DragAndDropFileTarget />
  {/if}
  <div class="snackbar-container">
    {#each $openedSnackbars as snackbar (snackbar.id)}
      <Snackbar {...snackbar} />
    {/each}
  </div>
</div>

<style>
  .root {
    color: var(--theme-generic-font);
  }

  /* 列表页：Schemas/Tables 列表 或 原连接管理 UI，占满状态栏以上的整屏 */
  .list-page {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: var(--dim-statusbar-height);
    display: flex;
  }
  .list-page.hidden {
    display: none;
  }
  /* Tables 列表页内布局：顶部导航 + 表列表内容，占满 list-page */
  .table-list-page {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .table-list-header {
    display: flex;
    align-items: center;
    height: 44px;
    flex-shrink: 0;
    background-color: var(--theme-tabs-panel-background);
    border-bottom: var(--theme-tabs-panel-border);
  }
  .table-list-header .back-button {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20pt;
    cursor: pointer;
    flex-shrink: 0;
  }
  .table-list-header .back-button:hover {
    color: var(--theme-generic-font-hover);
  }
  .table-list-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-right: 10px;
    font-size: 16px;
    font-weight: 600;
  }
  /* 数据页不能用 display:none 隐藏：表行 pointerup 会先于页面切换信号打开新 tab
     （行内 handler 先于 document 委托冒泡），DataGridCore 随之挂载。
     Svelte 4 的 bind:clientWidth 用 iframe resize hack 测量，挂载时祖先 display:none
     会测得 0，且页面恢复显示后移动端浏览器不触发 iframe 内部 resize，
     导致 gridScrollAreaWidth 为负、可见列数为 0（只剩行号列和表头首格箭头）。
     改用 visibility 隐藏：元素保持布局尺寸，任何时机挂载的网格都能测得正确宽高。 */
  .data-page.hidden {
    visibility: hidden;
    pointer-events: none;
  }
  /* TabContent（tabpanel/TabContent.svelte）自身声明了 visibility:visible
     （PC 端用它隐藏非活动 tab 同时保持挂载），会穿透祖先的 visibility:hidden，
     导致返回列表页后活动 tab 的网格内容仍浮在列表页上方。
     数据页隐藏时强制所有 TabContent 隐藏；仍保持布局尺寸，不影响网格测量。 */
  :global(.data-page.hidden [data-testid^='TabContent_']) {
    visibility: hidden !important;
  }
  .iconbar {
    width: var(--dim-widget-icon-size);
    display: flex;
    background: var(--theme-widget-panel-background);
  }
  .leftpanel {
    flex: 1;
    min-width: 0;
    background-color: var(--theme-sidebar-background);
    color: var(--theme-sidebar-foreground);
    display: flex;
    overflow: hidden;
  }

  /* 数据页：顶部导航 + 内容区，占满状态栏以上的整屏 */
  .data-page {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: var(--dim-statusbar-height);
    background-color: var(--theme-content-background);
  }
  .data-header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 44px;
    display: flex;
    align-items: center;
    background-color: var(--theme-tabs-panel-background);
    border-bottom: var(--theme-tabs-panel-border);
    z-index: 10;
  }
  .back-button {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20pt;
    cursor: pointer;
  }
  .back-button:hover {
    color: var(--theme-generic-font-hover);
  }
  .data-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-right: 10px;
  }
  .tabs-container {
    position: absolute;
    top: 44px;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--theme-content-background);
  }

  /* 移动端数据页：隐藏 DataGrid 的左侧面板（Columns/Filters/References/Macros）及其分割
     把手，使数据网格占满整屏。选择器双重锚定：style 含 min-width 的 .child1 是
     HorizontalSplitter 的横向左侧区域（VerticalSplitter 纵向布局用 min-height，不会误伤）；
     :has() 要求内部含 DataGrid_itemColumns，保证只命中 DataGrid 的列管理面板
     （QueryTab 等其他 HorizontalSplitter 不含该 testid，不受影响）。
     仅移动端数据页生效：PC 端不渲染 MbScreen，这些规则不匹配任何元素。 */
  :global([data-testid='MbScreen_dataPage'] .child1[style*='min-width']:has([data-testid='DataGrid_itemColumns'])) {
    display: none !important;
  }
  :global(
    [data-testid='MbScreen_dataPage']
      .child1[style*='min-width']:has([data-testid='DataGrid_itemColumns'])
      + .horizontal-split-handle
  ) {
    display: none !important;
  }

  .statusbar {
    position: fixed;
    background: var(--theme-statusbar-background);
    height: var(--dim-statusbar-height);
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
  }
  .commads {
    position: fixed;
    top: 44px;
    left: 0;
  }
  .snackbar-container {
    z-index: 1000;
    position: fixed;
    right: 0;
    bottom: var(--dim-statusbar-height);
  }
</style>
