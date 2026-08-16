import { writable } from 'svelte/store';

// 移动端专用 store（与 stores.ts 完全隔离，PC 端不引用此文件）：
// MobileSqlObjectList 中用户点击表对象时递增该计数器，
// MobileScreen 据此做列表页 → 数据页跳转（含点击已打开过的表）。
export const openTableRequestSignal = writable(0);
