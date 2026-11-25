import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { loadConfig } from './config';
import { openDb } from './db';

const config = loadConfig();
// In the production bundle the SPA build is copied to dist/public next to this file.
const bundledWeb = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
config.webDist ??= fs.existsSync(bundledWeb) ? bundledWeb : undefined;

const db = openDb(config.databasePath, config.encryptionKey);
const app = await buildApp(config, db);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  db.$client.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.host, port: config.port });
app.log.info(
  `Registration ${config.allowRegistration ? 'open' : 'closed (the first account can still register)'}; data in ${config.dataDir}`,
);
