<script lang="ts">
  // 移动端专用副本：与 DatabaseWidget.svelte 保持一致，
  // 仅将 DatabaseWidgetDetailContent 替换为 MobileDatabaseWidgetDetailContent
  // （其内部 SqlObjectList 点击时递增移动端页面跳转信号）。
  import { useCloudContentList, useConfig, useConnectionInfo } from '../utility/metadataLoaders';

  import ConnectionList from './ConnectionList.svelte';

  import WidgetColumnBar from './WidgetColumnBar.svelte';
  import WidgetColumnBarItem from './WidgetColumnBarItem.svelte';
  import SingleConnectionDatabaseList from './SingleConnectionDatabaseList.svelte';
  import _ from 'lodash';
  import { _t } from '../translations';
  import MobileDatabaseWidgetDetailContent from './MobileDatabaseWidgetDetailContent.svelte';

  export let hidden = false;
  let domSqlObjectList = null;

  $: config = useConfig();
  $: cloudContentList = useCloudContentList();
</script>

<WidgetColumnBar {hidden} storageName="databaseWidget">
  {#if $config?.singleConnection}
    <WidgetColumnBarItem title={_t('widget.databases', { defaultMessage: 'Databases' })} name="databases" height="35%">
      <SingleConnectionDatabaseList connection={$config?.singleConnection} />
    </WidgetColumnBarItem>
  {:else if !$config?.singleDbConnection}
    <WidgetColumnBarItem
      title={_t('common.connections', { defaultMessage: 'Connections' })}
      name="connections"
      height="35%"
      storeHeight
    >
      <ConnectionList
        passProps={{
          onFocusSqlObjectList: () => domSqlObjectList.focus(),
          cloudContentList: $cloudContentList,
        }}
      />
    </WidgetColumnBarItem>
  {/if}

  <MobileDatabaseWidgetDetailContent bind:domSqlObjectList showCloudConnection={false} />
</WidgetColumnBar>
