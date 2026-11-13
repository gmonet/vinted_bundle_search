import { localStorageStore, type KVStore } from './core/storage';

/** JS bridge exposed by the Android app (see android/.../MainActivity.kt). */
export interface AndroidBridge {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  openExternal(url: string): void;
  share(text: string): void;
  appVersion(): string;
}

declare global {
  interface Window {
    VbsAndroid?: AndroidBridge;
  }
}

declare const __VERSION__: string;

export interface Platform {
  kind: 'android' | 'userscript';
  version: string;
  store: KVStore;
  /** Opens a Vinted page (item, profile) without leaving the results. */
  open(url: string): void;
  share?(text: string): void;
}

export function detectPlatform(): Platform {
  const version = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';
  const bridge = window.VbsAndroid;
  if (bridge) {
    return {
      kind: 'android',
      version,
      store: {
        get: (k) => bridge.getItem(k),
        set: (k, v) => bridge.setItem(k, v),
        remove: (k) => bridge.removeItem(k),
      },
      open: (url) => bridge.openExternal(url),
      share: (text) => bridge.share(text),
    };
  }
  return {
    kind: 'userscript',
    version,
    store: localStorageStore(),
    open: (url) => void window.open(url, '_blank', 'noopener'),
  };
}
