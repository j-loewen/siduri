import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@brew/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { openDb } from '../src/db';

export async function makeApp(env: Record<string, string> = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brew-test-'));
  const config = loadConfig({ DATABASE_PATH: ':memory:', DATA_DIR: dataDir, LOG_LEVEL: 'silent', ...env });
  const db = openDb(config.databasePath, config.encryptionKey);
  const app = await buildApp(config, db);
  return { app, db, config };
}

/** A browser-like client: keeps its session cookie and sends the CSRF header. */
export function client(app: FastifyInstance, opts: { tab?: string } = {}) {
  let cookie: string | undefined;
  async function request(method: InjectOptions['method'], url: string, payload?: unknown, contentType?: string) {
    const res = await app.inject({
      method,
      url,
      payload: payload as InjectOptions['payload'],
      headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE, ...(cookie && { cookie }), ...(contentType && { 'content-type': contentType }), ...(opts.tab && { 'x-brew-tab': opts.tab }) },
    });
    const set = res.cookies.find((c) => c.name === 'brew_sid');
    if (set) cookie = set.value ? `brew_sid=${set.value}` : undefined;
    return res;
  }
  return {
    /** The session cookie header (for real HTTP requests, e.g. the event stream). */
    cookie: () => cookie,
    get: (url: string) => request('GET', url),
    post: (url: string, body?: unknown) => request('POST', url, body),
    patch: (url: string, body?: unknown) => request('PATCH', url, body),
    put: (url: string, body?: unknown) => request('PUT', url, body),
    delete: (url: string, body?: unknown) => request('DELETE', url, body),
    /** Raw file upload (the import endpoint). */
    upload: (url: string, data: Buffer | Uint8Array | string) =>
      request('POST', url, Buffer.isBuffer(data) ? data : Buffer.from(data as Uint8Array | string), 'application/octet-stream'),
    register: (username: string, password = 'password123') =>
      request('POST', '/api/auth/register', { username, password }),
    login: (username: string, password = 'password123') =>
      request('POST', '/api/auth/login', { username, password }),
  };
}
