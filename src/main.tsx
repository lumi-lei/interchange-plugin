import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// 主题：插件通过 ?theme=dark|light 与 DSH 界面保持一致；
// 未指定时跟随系统偏好，并随系统主题变化实时切换。
const themeParam = new URLSearchParams(window.location.search).get('theme');
const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)');

function applyTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

applyTheme(themeParam ? themeParam === 'dark' : Boolean(prefersDark?.matches));
prefersDark?.addEventListener('change', (event) => {
  if (!themeParam) applyTheme(event.matches);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
