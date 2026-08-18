<script lang="ts">
  // 移动端专用数据库列表组件：
  // 显示远程连接服务器上的所有数据库（MySQL 的 database、PostgreSQL 的 database 等）。
  // 数据源：useDatabaseList → server-connections/list-databases → driver.listDatabases()
  // 对于 MySQL 返回 [{name:"tk"}, {name:"from-java"}, {name:"information_schema"}, ...]
  //
  // 用户说的 "Schemas 列表" 实际上就是这个数据库列表。
  // 点击事件使用 pointerup（移动端可靠），handler 暂为 TODO，待下一级 Tables 页面开发时接入。
  import { currentDatabase, openedConnections } from '../stores';
  import { useDatabaseList } from '../utility/metadataLoaders';
  import { switchCurrentDatabase } from '../utility/common';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  // 优先使用 currentDatabase 中的连接 ID；
  // 新连接可能没有 defaultDatabase（currentDatabase 为 null），
  // 此时回退到第一个已打开连接的 ID，使数据库列表正常显示。
  $: conid = $currentDatabase?.connection?._id ?? $openedConnections[0] ?? null;

  // 当前选中的数据库名（用于高亮当前项）
  $: currentDbName = $currentDatabase?.name ?? null;

  // 获取服务器上所有数据库列表
  // API: server-connections/list-databases → driver.listDatabases()
  // 返回 [{name:"tk"}, {name:"from-java"}, {name:"information_schema"}, ...]
  $: databases = useDatabaseList({ conid });

  // 移动端点击处理（pointerup）：切换到选中数据库，通知父组件显示 Tables 列表
  function handleDbPointerUp(dbName: string) {
    if (!conid) return;
    const connection = $currentDatabase?.connection ?? null;
    switchCurrentDatabase({ connection, name: dbName });
    // 通过事件通知 MbScreen 切换到 Tables 列表页
    dispatch('selectDatabase', dbName);
  }
</script>

<!--
  移动端数据库列表页（用户称为 "Schemas 列表"）：
  - 下方为数据库名称列表，每项占满一行，pointerup 点击
  - 当前选中的数据库有高亮标记
  - 无搜索框、无工具栏
-->
<div class="mb-schema-list" data-testid="MbSchemaList_container">
  <!-- 数据库列表 -->
  <div class="db-items">
    {#if !conid}
      <!-- 未连接：currentDatabase 为 null，无 conid -->
      <div class="db-empty">
        Not connected. Please connect to a database first.
      </div>
    {:else if $databases && $databases.length > 0}
      {#each $databases as db}
        <div
          class="db-item"
          class:db-item-active={db.name === currentDbName}
          data-testid="MbSchemaList_item_{db.name}"
          on:pointerup={() => handleDbPointerUp(db.name)}
        >
          <span class="db-icon">◇</span>
          <span class="db-name">{db.name}</span>
          {#if db.name === currentDbName}
            <span class="db-active-badge">●</span>
          {/if}
        </div>
      {/each}
    {:else}
      <div class="db-empty">
        Loading databases...
      </div>
    {/if}
  </div>
</div>

<style>
  /* 整体容器：占满可用宽度和高度，纵向 flex 布局 */
  .mb-schema-list {
    display: flex;
    flex: 1;
    flex-direction: column;
    height: 100%;
    background-color: var(--theme-content-background);
    color: var(--theme-generic-font);
  }

  /* 数据库列表区域：可滚动 */
  .db-items {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* 单个数据库行：大点击区域，pointerup 响应 */
  .db-item {
    display: flex;
    align-items: center;
    padding: 14px 16px;
    min-height: 48px;
    cursor: pointer;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 0.1s ease;
  }
  .db-item:active {
    background-color: var(--theme-generic-font-hover, rgba(255, 255, 255, 0.06));
  }

  /* 当前选中数据库的高亮 */
  .db-item-active {
    background-color: rgba(255, 255, 255, 0.03);
  }

  /* 数据库图标 */
  .db-icon {
    flex-shrink: 0;
    width: 24px;
    font-size: 14px;
    color: var(--theme-generic-font, #ccc);
    opacity: 0.6;
    margin-right: 8px;
  }

  /* 数据库名称 */
  .db-name {
    flex: 1;
    min-width: 0;
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 当前选中数据库的标记 */
  .db-active-badge {
    flex-shrink: 0;
    font-size: 10px;
    color: #4caf50;
    margin-left: 8px;
  }

  /* 空状态 / 加载中 */
  .db-empty {
    padding: 24px 16px;
    text-align: center;
    color: var(--theme-generic-font, #999);
    font-size: 14px;
    opacity: 0.6;
  }
</style>
