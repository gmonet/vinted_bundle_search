import { render } from 'preact';
import { App, type AppHandle } from './ui/App';
import css from './ui/styles.css';
import { detectPlatform } from './platform';

/**
 * Entry point, injected into www.vinted.* pages (userscript on desktop, WebView on Android).
 * The UI lives in a shadow root so Vinted's CSS and ours never interfere.
 */
declare global {
  interface Window {
    __vbs?: AppHandle & { version: string };
  }
}

function mount() {
  if (window.__vbs) return; // already injected (Android re-injects on every page load)
  const platform = detectPlatform();

  const host = document.createElement('vbs-root');
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483000; inset: auto;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  shadow.appendChild(style);
  const container = document.createElement('div');
  shadow.appendChild(container);

  // Keep keystrokes typed in our inputs away from Vinted's shortcuts.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    container.addEventListener(type, (e) => e.stopPropagation());
  }

  const attach = () => {
    if (!host.isConnected) document.documentElement.appendChild(host);
  };
  attach();
  // Vinted's framework may rewrite the document; re-attach if we get removed.
  new MutationObserver(attach).observe(document.documentElement, { childList: true });

  const handle: AppHandle = { open() {}, close() {}, toggle() {}, handleBack: () => false };
  window.__vbs = Object.assign(handle, { version: platform.version });
  render(<App platform={platform} handle={handle} />, container);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
