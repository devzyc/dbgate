<script lang="ts">
  // 移动端专用副本：与 WidgetContainer.svelte 保持一致，
  // 仅将 DatabaseWidget 替换为 MobileDatabaseWidget（含移动端页面跳转信号）。
  import { visibleSelectedWidget } from '../stores';
  import ArchiveWidget from './ArchiveWidget.svelte';
  import MobileDatabaseWidget from './MobileDatabaseWidget.svelte';
  import FilesWidget from './FilesWidget.svelte';
  import PluginsWidget from './PluginsWidget.svelte';
  import HistoryWidget from './HistoryWidget.svelte';
  import AdminMenuWidget from './AdminMenuWidget.svelte';
  import AdminPremiumPromoWidget from './AdminPremiumPromoWidget.svelte';
  import PublicCloudWidget from './PublicCloudWidget.svelte';
  import PrivateCloudWidget from './PrivateCloudWidget.svelte';
  import hasPermission from '../utility/hasPermission';
  import { isProApp } from '../utility/proTools';
  import OpenedTabsWidget from './OpenedTabsWidget.svelte';
</script>

{#if hasPermission('widgets/database')}
  <MobileDatabaseWidget hidden={$visibleSelectedWidget != 'database'} />
{/if}
{#if $visibleSelectedWidget == 'file' && hasPermission('widgets/file')}
  <FilesWidget />
{/if}
{#if $visibleSelectedWidget == 'history' && hasPermission('widgets/history')}
  <HistoryWidget />
{/if}
{#if $visibleSelectedWidget == 'opened-tabs' && hasPermission('widgets/opened-tabs')}
  <OpenedTabsWidget />
{/if}
{#if $visibleSelectedWidget == 'archive' && hasPermission('widgets/archive') && isProApp()}
  <ArchiveWidget />
{/if}
{#if $visibleSelectedWidget == 'plugins' && hasPermission('widgets/plugins')}
  <PluginsWidget />
{/if}
{#if $visibleSelectedWidget == 'admin' && hasPermission('widgets/admin')}
  <AdminMenuWidget />
{/if}
{#if $visibleSelectedWidget == 'premium'}
  <AdminPremiumPromoWidget />
{/if}
{#if $visibleSelectedWidget == 'cloud-public' && hasPermission('widgets/cloud-public')}
  <PublicCloudWidget />
{/if}
{#if $visibleSelectedWidget == 'cloud-private' && hasPermission('widgets/cloud-private')}
  <PrivateCloudWidget />
{/if}
