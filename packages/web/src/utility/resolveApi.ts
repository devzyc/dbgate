import getElectron from './getElectron';
import { isAdminPage, isOneOfPage } from './pageDefs';

let apiUrl = null;
try {
  apiUrl = process.env.API_URL;
} catch {}

export default function resolveApi() {
  if (apiUrl) {
    // 开发模式下 API_URL 在构建时被写死为 http://localhost:3000。
    // 当页面通过局域网 IP 打开（如手机访问电脑）时，将 localhost/127.0.0.1
    // 替换为当前访问的主机名，使 API 请求指向运行服务的电脑；
    // PC 本机访问 localhost 时行为保持不变。
    const currentHost = window.location.hostname;
    if (
      currentHost &&
      currentHost !== 'localhost' &&
      currentHost !== '127.0.0.1' &&
      (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1'))
    ) {
      return apiUrl.replace('localhost', currentHost).replace('127.0.0.1', currentHost);
    }
    return apiUrl;
  }
  return (window.location.origin + window.location.pathname).replace(/\/[a-zA-Z-]+\.html$/, '').replace(/\/*$/, '');
}

export function resolveApiHeaders() {
  const electron = getElectron();

  const res = {};
  const accessToken = localStorage.getItem(isOneOfPage('admin', 'admin-license') ? 'adminAccessToken' : 'accessToken');
  if (accessToken) {
    res['Authorization'] = `Bearer ${accessToken}`;
  }
  // if (isAdminPage()) {
  //   res['x-is-admin-page'] = 'true';
  // }
  return res;
}
