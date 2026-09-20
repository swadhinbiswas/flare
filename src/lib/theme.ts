/**
 * Theme palette and light/dark mode helpers. The palette lives on
 * <html data-theme="...">, the mode on <html class="dark">. Both are applied
 * before first paint by the inline script in AppShell.astro, which reads the
 * same storage keys.
 */

export const THEMES = [
  { id: 'proton', label: 'Proton', hint: 'Purple, soft neutrals' },
  { id: 'zinc', label: 'Zinc', hint: 'Neutral, blue accent' },
  { id: 'nord', label: 'Nord', hint: 'Cool blue-grey, frost accent' },
  { id: 'rose', label: 'Rosé', hint: 'Warm, pink accent' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
export type ColorMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'rflare-theme-name';
export const MODE_STORAGE_KEY = 'rflare-theme';
export const DEFAULT_THEME: ThemeId = 'proton';

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function readThemeId(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(stored)) return stored;
  } catch {
    // private mode, no storage
  }
  return DEFAULT_THEME;
}

export function readColorMode(): ColorMode {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export function applyColorMode(mode: ColorMode): void {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export function themeLabel(id: ThemeId): string {
  return THEMES.find((theme) => theme.id === id)?.label ?? id;
}
