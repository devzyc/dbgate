<script>
  import WidgetContainer from './widgets/WidgetContainer.svelte';
  import WidgetIconPanel from './widgets/WidgetIconPanel.svelte';
  import {
    isFileDragActive,
    leftPanelWidth,
    openedSnackbars,
    selectedWidget,
    visibleWidgetSideBar,
    visibleCommandPalette,
    visibleTitleBar,
    rightPanelWidget,
    rightPanelWidth,
  } from './stores';
  import CommandPalette from './commands/CommandPalette.svelte';
  import splitterDrag from './utility/splitterDrag';
  import CurrentDropDownMenu from './modals/CurrentDropDownMenu.svelte';
  import StatusBar from './widgets/StatusBar.svelte';
  import Snackbar from './widgets/Snackbar.svelte';
  import ModalLayer from './modals/ModalLayer.svelte';
  import DragAndDropFileTarget from './DragAndDropFileTarget.svelte';
  import dragDropFileTarget from './utility/dragDropFileTarget';
  import TitleBar from './widgets/TitleBar.svelte';
  import getElectron from './utility/getElectron';
  import MultiTabsContainer from './tabpanel/MultiTabsContainer.svelte';
  import { currentThemeType } from './plugins/themes';
  import RightWidgetContainer from './widgets/RightWidgetContainer.svelte';

  $: currentThemeTypeClass = $currentThemeType == 'dark' ? 'theme-type-dark' : 'theme-type-light';

  const isElectron = !!getElectron();
</script>

<div
  class={`${currentThemeTypeClass} root dbgate-screen`}
  class:isElectron
  use:dragDropFileTarget
  on:contextmenu={e => e.preventDefault()}
>
  {#if $visibleTitleBar}
    <div class="titlebar">
      <TitleBar />
    </div>
  {/if}
  <div class="iconbar">
    <WidgetIconPanel />
  </div>
  <div class="statusbar">
    <StatusBar />
  </div>
  {#if $selectedWidget && $visibleWidgetSideBar}
    <div class="leftpanel">
      <WidgetContainer />
    </div>
  {/if}
  <div class="tabs-container">
    <MultiTabsContainer />
  </div>
  {#if $selectedWidget && $visibleWidgetSideBar}
    <div
      class="horizontal-split-handle left-splitter"
      use:splitterDrag={'clientX'}
      on:resizeSplitter={e => leftPanelWidth.update(x => x + e.detail)}
    />
  {/if}
  {#if $rightPanelWidget}
    <div
      class="horizontal-split-handle right-splitter"
      use:splitterDrag={'clientX'}
      on:resizeSplitter={e => rightPanelWidth.update(x => x - e.detail)}
    />
  {/if}
  {#if $rightPanelWidget}
    <div class="rightpanel">
      <RightWidgetContainer />
    </div>
  {/if}
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
  .iconbar {
    position: fixed;
    display: flex;
    left: 0;
    top: var(--dim-header-top);
    bottom: var(--dim-statusbar-height);
    width: var(--dim-widget-icon-size);
    background: var(--theme-widget-panel-background);
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
  .leftpanel {
    position: fixed;
    top: var(--dim-header-top);
    left: var(--dim-widget-icon-size);
    bottom: var(--dim-statusbar-height);
    width: var(--dim-left-panel-width);
    background-color: var(--theme-sidebar-background);
    color: var(--theme-sidebar-foreground);
    display: flex;
    border-right: var(--theme-sidebar-border);
  }

  .rightpanel {
    position: fixed;
    top: var(--dim-header-top);
    right: 0;
    bottom: var(--dim-statusbar-height);
    width: var(--dim-right-panel-width);
    background-color: var(--theme-altsidebar-background);
    color: var(--theme-altsidebar-foreground);
    display: flex;
    border-left: var(--theme-altsidebar-border);
  }
  .commads {
    position: fixed;
    top: var(--dim-header-top);
    left: var(--dim-widget-icon-size);
  }
  .toolbar {
    position: fixed;
    top: var(--dim-toolbar-top);
    height: var(--dim-toolbar-height);
    left: 0;
    right: 0;
    background: var(--theme-toolstrip-background);
  }

  .left-splitter {
    position: absolute;
    top: var(--dim-header-top);
    bottom: var(--dim-statusbar-height);
    left: calc(var(--dim-widget-icon-size) + var(--dim-left-panel-width));
  }

  .right-splitter {
    position: absolute;
    top: var(--dim-header-top);
    bottom: var(--dim-statusbar-height);
    right: var(--dim-content-right);
  }

  .snackbar-container {
    z-index: 1000;
    position: fixed;
    right: 0;
    bottom: var(--dim-statusbar-height);
  }

  .titlebar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--dim-titlebar-height);
  }

  .tabs-container {
    position: fixed;
    top: var(--dim-header-top);
    left: var(--dim-content-left);
    bottom: var(--dim-statusbar-height);
    right: var(--dim-content-right);
    background-color: var(--theme-content-background);
  }

  /* ===== 移动端布局适配（仅 MobileScreen 生效，桌面端 Screen.svelte 不受任何影响） ===== */
  @media only screen and (max-width: 600px) {
    .root {
      /* 左侧图标栏收窄，让出横向空间 */
      --dim-widget-icon-size: 40px;

      /* 左侧连接树面板收窄为屏宽 40%（上限 300px，宽屏自动回落），
         避免占用过多空间挤压右侧内容区；此处为组件内局部变量，
         优先于 html 上的 inline style，且不写 localStorage、不影响 store 驱动 */
      --dim-left-panel-width: min(300px, 40vw);

      /* 必须联动重算内容区左边界（在局部作用域内引用上面的新变量） */
      --dim-content-left: calc(
        var(--dim-widget-icon-size) + var(--dim-visible-left-panel) * (var(--dim-left-panel-width))
      );

      /* 右侧面板同理收窄 */
      --dim-right-panel-width: min(300px, 40vw);
      --dim-content-right: calc(
        var(--dim-visible-right-panel) * (var(--dim-right-panel-width))
      );

      /* 表单边距收窄，窄屏下给字段留出更多宽度 */
      --dim-large-form-margin: 10px;
    }

    /* 连接类型行：原生下拉框允许收缩到剩余空间，避免挤压右侧三点按钮 */
    :global(.connection-type-selector select) {
      min-width: 0;
      flex: 1;
    }
    :global(.connection-type-selector .driver-settings-button) {
      flex-shrink: 0;
    }
  }
</style>
