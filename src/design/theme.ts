import { ref } from 'vue';

export type ThemeMode = 'light' | 'dark';
const THEME_KEY = 'app-theme';
export const themeMode = ref<ThemeMode>(localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light');

export function applyTheme(mode: ThemeMode) {
  if (mode === 'dark') document.body.setAttribute('arco-theme', 'dark');
  else document.body.removeAttribute('arco-theme');
}

export function setThemeMode(mode: ThemeMode) {
  themeMode.value = mode;
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
}
