import { useEffect, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { LiveArea, LiveEvent } from '@brew/shared';
import { TAB_ID } from './api';
import { meKey } from './auth';
import { keys } from './data';

export type LiveStatus = 'connecting' | 'live' | 'offline';

const AREA_KEYS: Record<LiveArea, (id?: string) => readonly unknown[][]> = {
  library: () => [['library']],
  recipes: (id) => [['recipes'], ...(id ? [[...keys.recipe(id)]] : [])],
  equipment: () => [[...keys.equipment], ['vessels']],
  settings: () => [[...keys.settings]],
  batches: () => [['batches'], ['vessels']],
  inventory: () => [['inventory']],
  devices: () => [['devices'], ['rapt'], ['tilt']],
};

function refreshAll(qc: QueryClient) {
  void qc.invalidateQueries();
}

function handle(qc: QueryClient, event: LiveEvent) {
  if (event.kind === 'me') void qc.invalidateQueries({ queryKey: meKey });
  if (event.kind === 'changed') {
    for (const key of AREA_KEYS[event.area](event.id)) void qc.invalidateQueries({ queryKey: key });
  }
}

/**
 * Keeps this tab up to date with changes made elsewhere (other devices, a brewing partner), over
 * a Server-Sent Events stream. Hidden tabs disconnect and catch up when they are shown again.
 */
export function useLiveUpdates(enabled: boolean): LiveStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    let source: EventSource | null = null;
    let connectedBefore = false;

    const connect = () => {
      if (source) return;
      source = new EventSource(`/api/events?tab=${encodeURIComponent(TAB_ID)}`);
      source.onopen = () => {
        setStatus('live');
        if (connectedBefore) refreshAll(qc);
        connectedBefore = true;
      };
      source.onmessage = (msg) => {
        try {
          handle(qc, JSON.parse(msg.data as string) as LiveEvent);
        } catch {
          // Ignore malformed events.
        }
      };
      source.onerror = () => setStatus(source?.readyState === EventSource.CLOSED ? 'offline' : 'connecting');
    };
    const disconnect = () => {
      source?.close();
      source = null;
    };
    const onVisibility = () => {
      if (document.hidden) disconnect();
      else connect();
    };

    if (!document.hidden) connect();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      disconnect();
    };
  }, [enabled, qc]);

  return status;
}
