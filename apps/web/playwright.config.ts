import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/** Minimal .env.e2e loader (no dotenv dependency); missing file is fine. */
function loadEnvFile(file: string): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(resolve(__dirname, file), 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !line.trimStart().startsWith('#')) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
    }
    return out;
  } catch {
    return {};
  }
}

const e2eEnv = { ...loadEnvFile('.env.e2e'), ...process.env } as Record<string, string>;
const PORT = e2eEnv.E2E_WEB_PORT ?? '3000';
const BASE_URL = e2eEnv.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // specs share one backend + database
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    locale: 'bg-BG',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: e2eEnv,
  },
});
