// 配色主题目录与主题状态管理。
// 优先级：用户手动选择（localStorage） > 插件 ?theme= 参数（DSH 界面主题） > 系统明暗偏好。

export const THEMES = [
  { id: 'dark', label: '深色' },
  { id: 'navy', label: '夜蓝' },
  { id: 'light', label: '浅色' },
  { id: 'forest', label: '森绿' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const STORAGE_KEY = 'interchange-theme';
const themeParam = new URLSearchParams(window.location.search).get('theme');

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((theme) => theme.id === value);
}

function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function resolveInitialTheme(): ThemeId {
  const stored = readStoredTheme();
  if (isThemeId(stored)) return stored;
  if (isThemeId(themeParam)) return themeParam;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
}

export function persistTheme(id: ThemeId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 隐私模式等场景下无法持久化时，主题仍会应用到当前会话。
  }
}

// 用户手动选择过主题、或插件指定了主题参数时不跟随系统；
// 否则实时跟随系统明暗切换，返回取消订阅函数。
export function followSystemTheme(onChange: (id: ThemeId) => void): () => void {
  if (readStoredTheme() !== null || isThemeId(themeParam)) return () => {};
  const query = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!query) return () => {};
  const listener = (event: MediaQueryListEvent) => onChange(event.matches ? 'dark' : 'light');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
