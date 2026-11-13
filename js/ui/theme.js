// Light or dark look, chosen in Settings > View. Until one is chosen, the app
// starts with the device's own. Kept on this device only (each device can look
// its own way); index.html applies it before the page draws, so it doesn't flash.

const KEY = 'macros.theme';
export const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const deviceTheme = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch { /* storage unavailable */ }
  return deviceTheme();
}

export function applyTheme(theme = getTheme()) {
  document.documentElement.dataset.theme = theme;
  // The phone's status bar colour follows the app's background.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', theme === 'dark' ? '#11100e' : '#f6f4ef');
  }
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* still applies for this visit */ }
  applyTheme(theme);
}
