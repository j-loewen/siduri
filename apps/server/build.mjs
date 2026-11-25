// Bundles the server into dist/index.js. Everything is bundled except native modules, which are
// listed in dist/package.json (pinned to the lockfile versions) and installed in the Docker image.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

/**
 * Packages with native binaries: cannot be bundled, installed next to the bundle instead.
 * better-sqlite3 is an alias of better-sqlite3-multiple-ciphers (encryption); the alias is kept.
 */
const NATIVE = ['better-sqlite3', '@node-rs/argon2'];

const lock = JSON.parse(fs.readFileSync('../../package-lock.json', 'utf8'));
const runtimeDeps = Object.fromEntries(
  NATIVE.map((name) => {
    const entry = lock.packages[`node_modules/${name}`];
    if (!entry?.version) throw new Error(`${name} not found in package-lock.json`);
    // An aliased package records its real name in the lockfile.
    return [name, entry.name && entry.name !== name ? `npm:${entry.name}@${entry.version}` : entry.version];
  }),
);

fs.rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  minifySyntax: true,
  external: NATIVE,
  // Bundled CommonJS dependencies may call require() or use __dirname; provide both in ESM.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __pathDirname } from 'node:path';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __pathDirname(__filename);',
    ].join('\n'),
  },
  logLevel: 'info',
});

fs.writeFileSync(
  'dist/package.json',
  JSON.stringify({ name: 'brew-server', private: true, type: 'module', dependencies: runtimeDeps }, null, 2) + '\n',
);
fs.cpSync('drizzle', 'dist/drizzle', { recursive: true });

const web = path.resolve('../web/dist');
if (fs.existsSync(path.join(web, 'index.html'))) {
  fs.cpSync(web, 'dist/public', { recursive: true });
  console.log('Copied web build to dist/public');
} else {
  console.warn('No web build found (apps/web/dist); the server will run API-only');
}
