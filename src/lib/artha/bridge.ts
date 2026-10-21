import { get, writable } from 'svelte/store';
import { user, theme, showSidebar } from '$lib/stores';

export const APPEARANCES = ['light', 'light-purple', 'deep-purple', 'graphite'] as const;
export type Appearance = (typeof APPEARANCES)[number];
export const arthaAppearance = writable<Appearance>('light-purple');
export const arthaEmbedded = writable(false);
const CHANNEL = 'artha-assistant';
const KEY = 'artha-chewie-appearance';
const PARENTS = new Set(['https://pitch.artha.vc', 'https://pitch.arthatest.xyz']);
if (import.meta.env.DEV) {
  PARENTS.add('http://localhost:8080');
  PARENTS.add('http://localhost:5173');
}
export function trustedHost(event: MessageEvent, parent: Window, self: Window) {
  return parent !== self && event.source === parent && PARENTS.has(event.origin) &&
    event.data?.channel === CHANNEL && event.data?.version === 1;
}
export function applyAppearance(value: string, remember = false) {
  if (get(arthaEmbedded) && remember) return;
  const appearance = value === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'deep-purple' : 'light-purple')
    : APPEARANCES.includes(value as Appearance) ? value as Appearance : 'light-purple';
  const dark = appearance === 'deep-purple' || appearance === 'graphite';
  document.documentElement.dataset.arthaAppearance = appearance;
  document.documentElement.classList.remove('light', 'dark', 'oled-dark', 'her');
  document.documentElement.classList.add(dark ? 'dark' : 'light');
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  // Earlier native theme selections can leave inline palette values behind.
  for (const shade of ['800', '850', '900', '950']) document.documentElement.style.removeProperty(`--color-gray-${shade}`);
  arthaAppearance.set(appearance);
  theme.set(dark ? 'dark' : 'light');
  if (remember) {
    try { localStorage.setItem(KEY, value); localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* Storage can be unavailable in an iframe. */ }
  }
}
export function readAppearancePreference() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'system' || APPEARANCES.includes(saved as Appearance)) return saved!;
    const legacy = localStorage.getItem('theme');
    return legacy === 'dark' ? 'deep-purple' : legacy === 'oled-dark' ? 'graphite' : legacy === 'system' ? 'system' : 'light-purple';
  } catch { return 'light-purple'; }
}
export function installArthaBridge() {
  let host: string | null = null;
  const saved = readAppearancePreference;
  applyAppearance(saved());
  const publish = () => {
    if (!host) return;
    const account = get(user);
    const authenticated = !!account?.email && ['user', 'admin'].includes(account.role);
    window.parent.postMessage({ channel: CHANNEL, version: 1, type: 'session', authenticated, ...(authenticated ? { email: account.email } : {}) }, host);
  };
  const receive = (event: MessageEvent) => {
    if (!trustedHost(event, window.parent, window) || event.data.type !== 'init' || !APPEARANCES.includes(event.data.appearance)) return;
    if (!host) showSidebar.set(false);
    host = event.origin;
    arthaEmbedded.set(true);
    document.documentElement.dataset.arthaEmbedded = 'true';
    applyAppearance(event.data.appearance);
    publish();
  };
  const stop = user.subscribe(publish);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const systemChanged = () => { if (!host && saved() === 'system') applyAppearance('system'); };
  window.addEventListener('message', receive);
  media.addEventListener('change', systemChanged);
  return () => { stop(); window.removeEventListener('message', receive); media.removeEventListener('change', systemChanged); };
}
