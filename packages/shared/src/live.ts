/**
 * Live refresh: the server pushes small hints over Server-Sent Events (GET /api/events). They
 * never contain data; clients refetch what changed through the normal API.
 */
export type LiveEvent =
  /** Sent once when the stream opens. */
  | { kind: 'hello' }
  /** Something in an area changed (list views refetch). */
  | { kind: 'changed'; area: LiveArea; id?: string }
  /** My account (preferences) changed. */
  | { kind: 'me' };

export type LiveArea = 'library' | 'recipes' | 'equipment' | 'batches' | 'inventory' | 'settings' | 'devices' | 'trash';

/** Each browser tab sends a random id, so it is not told about its own changes. */
export const TAB_HEADER = 'x-brew-tab';
