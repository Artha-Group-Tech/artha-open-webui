import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { user } from '$lib/stores';
import { applyAppearance, arthaEmbedded, installArthaBridge, readAppearancePreference, trustedHost } from './bridge';

vi.mock('$lib/stores', async () => {
  const { writable } = await import('svelte/store');
  return { user: writable(undefined), theme: writable('light'), showSidebar: writable(true) };
});
let handler: (event: MessageEvent) => void;
let parent: { postMessage: ReturnType<typeof vi.fn> };
let self: any;
let dataset: Record<string, string>;
let storage: Map<string, string>;
beforeEach(() => {
  parent = { postMessage: vi.fn() };
  self = { parent, addEventListener: vi.fn((type, fn) => { if (type === 'message') handler = fn; }), removeEventListener: vi.fn(), matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) };
  dataset = {};
  storage = new Map();
  vi.stubGlobal('window', self);
  vi.stubGlobal('document', { documentElement: { dataset, classList: { add: vi.fn(), remove: vi.fn() }, style: { removeProperty: vi.fn() } } });
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  arthaEmbedded.set(false);
  user.set(undefined);
});
const init = (extra = {}) => ({ origin: 'https://pitch.artha.vc', source: parent, data: { channel: 'artha-assistant', version: 1, type: 'init', appearance: 'graphite' }, ...extra }) as unknown as MessageEvent;

describe('Artha workspace bridge', () => {
  it('rejects messages from unrelated windows, hosts and protocol versions', () => {
    expect(trustedHost(init(), parent as unknown as Window, self)).toBe(true);
    expect(trustedHost(init({ source: self }), parent as unknown as Window, self)).toBe(false);
    expect(trustedHost(init({ origin: 'https://attacker.example' }), parent as unknown as Window, self)).toBe(false);
    expect(trustedHost(init({ data: { channel: 'artha-assistant', version: 2 } }), parent as unknown as Window, self)).toBe(false);
  });
  it('confirms the current authenticated account after a trusted handshake', () => {
    const stop = installArthaBridge();
    handler(init());
    expect(dataset.arthaAppearance).toBe('graphite');
    expect(get(arthaEmbedded)).toBe(true);
    expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ authenticated: false }), 'https://pitch.artha.vc');
    user.set({ email: 'riya@artha.vc', role: 'user' } as any);
    expect(parent.postMessage).toHaveBeenLastCalledWith({ channel: 'artha-assistant', version: 1, type: 'session', authenticated: true, email: 'riya@artha.vc' }, 'https://pitch.artha.vc');
    user.set(undefined);
    expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ authenticated: false }), 'https://pitch.artha.vc');
    stop();
  });
  it('does not disclose identity or change the theme to untrusted senders', () => {
    const stop = installArthaBridge();
    handler(init({ origin: 'https://attacker.example' }));
    expect(parent.postMessage).not.toHaveBeenCalled();
    expect(dataset.arthaAppearance).toBe('light-purple');
    stop();
  });
  it('keeps embedded theme changes separate from standalone preferences', () => {
    applyAppearance('deep-purple', true);
    expect(storage.get('artha-chewie-appearance')).toBe('deep-purple');
    const stop = installArthaBridge();
    handler(init());
    expect(storage.get('artha-chewie-appearance')).toBe('deep-purple');
    applyAppearance('light', true);
    expect(dataset.arthaAppearance).toBe('graphite');
    stop();
  });
  it('migrates existing dark preferences without replacing them with a light default', () => {
    storage.set('theme', 'dark');
    expect(readAppearancePreference()).toBe('deep-purple');
    storage.set('theme', 'oled-dark');
    expect(readAppearancePreference()).toBe('graphite');
  });
});
