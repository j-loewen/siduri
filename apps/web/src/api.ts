import { CSRF_HEADER, CSRF_HEADER_VALUE, TAB_HEADER, type ApiError as ApiErrorBody } from '@brew/shared';

/**
 * Identifies this browser tab, so live updates about its own changes are not sent back to it.
 * Not crypto.randomUUID(): browsers only offer that on HTTPS/localhost, and the app is often
 * opened over plain http://<server-ip>.
 */
export const TAB_ID = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

/** A random (version 4) UUID; works over plain HTTP too, unlike crypto.randomUUID(). */
export function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function api<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      [CSRF_HEADER]: CSRF_HEADER_VALUE,
      [TAB_HEADER]: TAB_ID,
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = data as Partial<ApiErrorBody> | null;
    throw new ApiError(res.status, err?.error ?? 'error', err?.message ?? res.statusText, err?.details);
  }
  return data as T;
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');

/** Upload a file as the raw request body. */
export async function uploadFile<T>(path: string, file: Blob): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE, [TAB_HEADER]: TAB_ID, 'content-type': 'application/octet-stream' },
    body: file,
  });
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = data as Partial<ApiErrorBody> | null;
    throw new ApiError(res.status, err?.error ?? 'error', err?.message ?? res.statusText, err?.details);
  }
  return data as T;
}

/** Download a file from the API (errors are thrown, not shown as a page). */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
    throw new ApiError(res.status, err?.error ?? 'error', err?.message ?? res.statusText);
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="([^"]+)"/i.exec(disposition)?.[1];
  saveBlob(await res.blob(), encoded ? decodeURIComponent(encoded) : (plain ?? fallbackName));
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
