import fs from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  host: string;
  port: number;
  /** Directory holding app.db. */
  dataDir: string;
  /** SQLite file path, or ':memory:' (tests). Defaults to <dataDir>/app.db. */
  databasePath: string;
  /** ALLOW_REGISTRATION env. The very first account can always register. */
  allowRegistration: boolean;
  baseUrl: string | undefined;
  cookieSecure: boolean;
  sessionDays: number;
  trustProxy: boolean;
  /** Optional database encryption key (ENCRYPTION_KEY or ENCRYPTION_KEY_FILE). */
  encryptionKey: string | undefined;
  /** Live-refresh stream heartbeat (ms); also how quickly a stream ends after logout. */
  liveHeartbeatMs: number;
  /** Built SPA to serve; undefined = API only (dev uses the Vite dev server). */
  webDist: string | undefined;
  logLevel: string;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Shortest accepted encryption key (`openssl rand -hex 32` gives 64 characters). */
export const MIN_KEY_LENGTH = 32;

function encryptionKey(env: NodeJS.ProcessEnv): string | undefined {
  const file = env.ENCRYPTION_KEY_FILE?.trim();
  let key = env.ENCRYPTION_KEY?.trim() || undefined;
  if (file) {
    try {
      key = fs.readFileSync(file, 'utf8').trim();
    } catch (err) {
      throw new Error(`Cannot read ENCRYPTION_KEY_FILE (${file}): ${(err as Error).message}`);
    }
  }
  if (!key) return undefined;
  if (key.length < MIN_KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY is too short: use at least ${MIN_KEY_LENGTH} characters (openssl rand -hex 32)`);
  }
  return key;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(env.DATA_DIR ?? './data');
  const baseUrl = env.BASE_URL?.trim() || undefined;
  return {
    host: env.HOST ?? '0.0.0.0',
    port: int(env.PORT, 3000),
    dataDir,
    databasePath: env.DATABASE_PATH ?? path.join(dataDir, 'app.db'),
    allowRegistration: bool(env.ALLOW_REGISTRATION, false),
    baseUrl,
    cookieSecure: bool(env.COOKIE_SECURE, baseUrl?.startsWith('https://') ?? false),
    sessionDays: int(env.SESSION_DAYS, 30),
    trustProxy: bool(env.TRUST_PROXY, false),
    encryptionKey: encryptionKey(env),
    liveHeartbeatMs: Math.max(50, int(env.LIVE_HEARTBEAT_MS, 25_000)),
    webDist: env.WEB_DIST,
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
