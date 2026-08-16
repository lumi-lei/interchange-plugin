import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, resolveInitialTheme } from './theme';
import './styles.css';

// 渲染前先应用主题，避免首帧闪烁：
// 用户手动选择 > 插件 ?theme= 参数（与 DSH 界面一致） > 系统明暗偏好。
applyTheme(resolveInitialTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
