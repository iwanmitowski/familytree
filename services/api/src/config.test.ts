import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults when only DATABASE_URL is provided', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://user:pw@localhost:5433/db' });
    expect(config).toEqual({
      DATABASE_URL: 'postgres://user:pw@localhost:5433/db',
      PORT: 8080,
      LOG_LEVEL: 'info',
      ENV: 'dev',
    });
  });

  it('coerces PORT from a string', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://x', PORT: '9090' });
    expect(config.PORT).toBe(9090);
  });

  it('fails fast naming the missing variable', () => {
    expect(() => loadConfig({})).toThrowError(/DATABASE_URL/);
  });

  it('rejects an unknown ENV value', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x', ENV: 'staging' })).toThrowError(/ENV/);
  });

  it('rejects an invalid LOG_LEVEL', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x', LOG_LEVEL: 'loud' })).toThrowError(
      /LOG_LEVEL/,
    );
  });
});
