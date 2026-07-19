// Test stub for the `server-only` marker package (aliased in vitest.config.ts).
// In production `server-only` makes client imports a build error; in unit tests
// we replace it with this no-op so server modules can be exercised in node.
export {};
