import { writable } from 'svelte/store';

// 移动端专用 store（与 stores.ts 完全隔离，PC 端不引用此文件）：
// MbSqlObjectList 中用户点击表对象时递增该计数器，
// MbScreen 据此做列表页 → 数据页跳转（含点击已打开过的表）。
export const openTableRequestSignal = writable(0);

// 移动端打开非表类 tab（如新建连接 ConnectionTab）时递增，
// MbScreen 同样据此切到数据页展示新 tab 内容。
export const openTabRequestSignal = writable(0);
