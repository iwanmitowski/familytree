import { build } from 'esbuild';

// Some bundled CommonJS dependencies (pg, pino) call require() at runtime;
// this banner provides it inside the ESM output.
const banner = {
  js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
};

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  banner,
  // pg-native is an optional native addon; pino-pretty is dev-only.
  external: ['pg-native', 'pino-pretty'],
  logLevel: 'info',
};

await build({ ...shared, entryPoints: ['src/index.ts'], outfile: 'dist/index.js' });
await build({ ...shared, entryPoints: ['src/db/migrate.ts'], outfile: 'dist/db/migrate.js' });
