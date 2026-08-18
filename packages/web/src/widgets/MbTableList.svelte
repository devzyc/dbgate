<script lang="ts">
  // 移动端专用表列表组件：
  // 显示选中数据库下的所有表（tables、views 等）。
  // 数据源：useDatabaseInfo → database-connections/info → driver.analyseDatabase()
  // 点击事件使用 pointerup（移动端可靠），表项点击打开对应数据表 tab 并触发页面跳转。
  import { useDatabaseInfo } from '../utility/metadataLoaders';
  import { _t } from '../translations';
  import * as databaseObjectAppObject from '../appobj/MbDatabaseObjectAppObject.svelte';
  import { openTableRequestSignal } from '../mbStores';

  export let conid;
  export let database;

  $: dbInfo = useDatabaseInfo({ conid, database });

  // 用 dbInfoKey 追踪 $dbInfo 实际对应的 params，避免缓存旧数据导致的误判。
  // 初始时 dbInfoKey 为空字符串，与任何有效 key 都不匹配 → isLoading = true。
  // 当 conid/database 变化时，dbInfoKey 仍是旧的 → isLoading = true。
  // 当 store emit 新值时，dbInfoKey 同步更新为当前 params → isLoading = false。
  let dbInfoKey = '';
  let isLoading = true;

  // 每次 conid 或 database 变化 → 标记为加载中
  $: {
    const newKey = `${conid}::${database}`;
    if (newKey !== dbInfoKey) {
      isLoading = true;
    }
  }

  // $dbInfo 更新时 → 仅当它对应的是当前 params 才标记为已加载
  // （避免旧缓存数据在参数变化后立即被误认为「已加载」）
  $: {
    const currentKey = `${conid}::${database}`;
    if ($dbInfo != null && currentKey === dbInfoKey) {
      // $dbInfo 有值且对应当前 params → 已加载
      isLoading = false;
    } else if ($dbInfo != null && currentKey !== dbInfoKey) {
      // $dbInfo 有值但对应的是旧 params → 这是 store 第一次 emit 新数据
      // 更新 dbInfoKey 并标记为已加载
      dbInfoKey = currentKey;
      isLoading = false;
    }
  }

  // 合并 tables + views + matviews + collections 为一个扁平列表（移动端简化展示）
  // 注意：只有当 $dbInfo 有值时才计算列表，避免在加载期间显示空状态
  $: tableLikeList = $dbInfo
    ? [
        ...(($dbInfo?.tables || []).map(t => ({ ...t, objectTypeField: 'tables' }))),
        ...(($dbInfo?.views || []).map(v => ({ ...v, objectTypeField: 'views' }))),
        ...(($dbInfo?.matviews || []).map(v => ({ ...v, objectTypeField: 'matviews' }))),
        ...(($dbInfo?.collections || []).map(c => ({ ...c, objectTypeField: 'collections' }))),
      ]
    : null;

  // 表项点击处理（pointerup）：打开该表的数据 tab，并递增信号触发列表页 → 数据页跳转。
  // 使用 handleDatabaseObjectClick（MbDatabaseObjectAppObject 副本导出）：
  // 内部根据 objectTypeField 自动选择正确的 tab 组件
  // （tables → TableDataTab, views/matviews → ViewDataTab, collections → CollectionDataTab），
  // 并处理 tab 已存在时的幂等激活逻辑。
  // 信号递增放在调用之后，MbScreen 据此切到数据页展示新 tab 内容。
  function handleTablePointerUp(item: any) {
    databaseObjectAppObject.handleDatabaseObjectClick(
      {
        ...item,
        conid,
        database,
      },
      { tabPreviewMode: false }
    );
    openTableRequestSignal.update(x => x + 1);
  }

  // 获取对象类型图标
  function getTypeIcon(objectTypeField: string): string {
    switch (objectTypeField) {
      case 'tables': return '';
      case 'views': return '';
      case 'matviews': return '⊟';
      case 'collections': return '⊡';
      default: return '◇';
    }
  }
</script>

<!--
  移动端表列表页：
  - 顶部显示数据库名称标题
  - 下方为表名称列表，每项只显示表名
  - 每项占满一行，pointerup 点击
  - 无搜索框、无工具栏（移动端简化）
-->
<div class="mb-table-list" data-testid="MbTableList_container">
  <!-- 数据库标题 -->
  <div class="db-header" data-testid="MbTableList_dbHeader">
    <span class="db-header-icon">⊞</span>
    <span class="db-header-name">{database}</span>
  </div>

  <!-- 表列表 -->
  <div class="table-items">
    {#if !conid || !database}
      <div class="table-empty">
        {_t('common.notConnected', { defaultMessage: 'Not connected. Please connect to a database first.' })}
      </div>
    {:else if isLoading}
      <!-- 加载中：带动态省略号的加载提示 -->
      <div class="table-loading">
        <div class="loading-spinner"></div>
        <span class="loading-text">Loading<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span>
      </div>
    {:else if tableLikeList.length > 0}
      {#each tableLikeList as item}
        <div
          class="table-item"
          data-testid="MbTableList_item_{item.pureName}"
          on:pointerup={() => handleTablePointerUp(item)}
        >
          <span class="table-icon">{getTypeIcon(item.objectTypeField)}</span>
          <div class="table-info">
            <span class="table-name">{item.pureName}</span>
          </div>
        </div>
      {/each}
    {:else}
      <!-- 数据库确实为空（已加载完成但无表） -->
      <div class="table-empty">
        {_t('sqlObject.databaseEmpty', {
          defaultMessage: 'Database {database} is empty or structure is not loaded.',
          values: { database },
        })}
      </div>
    {/if}
  </div>
</div>

<style>
  /* 整体容器：占满可用宽度和高度，纵向 flex 布局 */
  .mb-table-list {
    display: flex;
    flex: 1;
    flex-direction: column;
    height: 100%;
    background-color: var(--theme-content-background);
    color: var(--theme-generic-font);
  }

  /* 数据库标题栏 */
  .db-header {
    display: flex;
    align-items: center;
    padding: 16px 16px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }
  .db-header-icon {
    flex-shrink: 0;
    width: 28px;
    font-size: 16px;
    color: var(--theme-generic-font, #ccc);
    opacity: 0.7;
    margin-right: 8px;
  }
  .db-header-name {
    font-size: 17px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 表列表区域：可滚动 */
  .table-items {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* 单个表行：大点击区域，pointerup 响应 */
  .table-item {
    display: flex;
    align-items: center;
    padding: 16px 16px;
    min-height: 56px;
    cursor: pointer;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 0.1s ease;
  }
  .table-item:active {
    background-color: var(--theme-generic-font-hover, rgba(255, 255, 255, 0.06));
  }

  /* 表图标 */
  .table-icon {
    flex-shrink: 0;
    width: 28px;
    font-size: 16px;
    color: var(--theme-generic-font, #ccc);
    opacity: 0.6;
    margin-right: 10px;
  }

  /* 表信息区域 */
  .table-info {
    flex: 1;
    min-width: 0;
  }

  /* 表名称 */
  .table-name {
    font-size: 16px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 加载中：居中 + 动态省略号 */
  .table-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 48px 16px;
    color: var(--theme-generic-font, #ccc);
  }
  .loading-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: var(--theme-generic-font, #ccc);
    border-radius: 50%;
    animation: mb-spin 0.8s linear infinite;
  }
  @keyframes mb-spin {
    to { transform: rotate(360deg); }
  }
  .loading-text {
    font-size: 16px;
    font-weight: 500;
  }
  .loading-text .dot {
    display: inline-block;
    opacity: 0;
    animation: mb-dot-fade 1.4s infinite;
  }
  .loading-text .dot:nth-child(2) { animation-delay: 0.2s; }
  .loading-text .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes mb-dot-fade {
    0%, 80%, 100% { opacity: 0; }
    40% { opacity: 1; }
  }

  /* 空状态 */
  .table-empty {
    padding: 32px 16px;
    text-align: center;
    color: var(--theme-generic-font, #999);
    font-size: 15px;
    opacity: 0.6;
  }
</style>
