import { useEffect, useState } from 'react';

/**
 * Brew-day alerts: a beep (Web Audio, no sound file), vibration and a system notification.
 * Browsers only allow sound after a user gesture, so `unlockAudio()` is called from a button.
 */
let audio: AudioContext | null = null;

export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

export const audioReady = () => audio?.state === 'running';

/** Three short beeps. */
export function beep(times = 3) {
  if (!audio) return;
  const start = audio.currentTime + 0.02;
  for (let i = 0; i < times; i++) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    const t0 = start + i * 0.32;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + 0.25);
  }
}

export function vibrate() {
  try {
    navigator.vibrate?.([300, 120, 300, 120, 300]);
  } catch {
    // Not supported.
  }
}

export async function requestNotifications() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch {
    // Ignored: alerts still show in the page.
  }
}

/** A system notification (shown even when the tab is in the background). */
export function systemNotify(title: string, body: string, tag: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    // Through the service worker when there is one (required on Android).
    if (navigator.serviceWorker?.controller) {
      void navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body, tag, icon: '/icons/icon-192.png' }));
    } else {
      new Notification(title, { body, tag, icon: '/icons/icon-192.png' });
    }
  } catch {
    // Ignored.
  }
}

/** Keeps the screen on while `active` (re-acquired when the page becomes visible again). */
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) void lock.release();
        else {
          setHeld(true);
          lock.addEventListener('release', () => setHeld(false));
        }
      } catch {
        setHeld(false);
      }
    };
    void acquire();
    const onVisible = () => void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
      setHeld(false);
    };
  }, [active]);
  return held;
}

/** Current time, updated every `intervalMs`. */
export function useNow(intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
