import { defineConfig } from 'vitest/config';

// Integration tests hit the real dev PostgreSQL (docker-compose.dev.yml).
// They are gated on DATABASE_URL (loaded from .env via dotenv) and skip cleanly
// when it is absent.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['dotenv/config'],
    testTimeout: 15_000,
    // Integration files share the familytree_test database — never in parallel.
    fileParallelism: false,
  },
});
