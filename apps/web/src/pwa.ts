import { useSyncExternalStore } from 'react';

/** Chrome/Edge/Android: the event that lets the app offer its own "Install" button. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Registers the service worker and listens for the browser's install offer. Call once at startup. */
export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the offer for the "Install app" menu item instead of the browser's mini-infobar.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  // Service workers need a secure context (https or localhost); the dev server has none.
  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker registration failed', err));
    });
  }
}

/** True when running as the installed app (its own window) rather than in a browser tab. */
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** The browser offers installation right now (Chromium-based browsers only). */
export function useCanInstall() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => deferred !== null,
  );
}

/** Shows the browser's install dialog. */
export async function promptInstall() {
  const e = deferred;
  if (!e) return;
  deferred = null;
  notify();
  await e.prompt();
}
