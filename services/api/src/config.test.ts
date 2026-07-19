import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const REQUIRED = {
  DATABASE_URL: 'postgres://user:pw@localhost:5433/db',
  SERVICE_ID: 'familytree-bff-dev',
  SERVICE_HMAC_SECRET: 'dev-only-hmac-secret-0123456789abcdef',
};

describe('loadConfig', () => {
  it('applies defaults when only the required variables are provided', () => {
    const config = loadConfig({ ...REQUIRED });
    expect(config).toEqual({
      ...REQUIRED,
      PORT: 8080,
      LOG_LEVEL: 'info',
      ENV: 'dev',
    });
  });

  it('coerces PORT from a string', () => {
    const config = loadConfig({ ...REQUIRED, PORT: '9090' });
    expect(config.PORT).toBe(9090);
  });

  it('fails fast naming the missing variable', () => {
    expect(() => loadConfig({})).toThrowError(/DATABASE_URL/);
  });

  it('requires the HMAC service credentials', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x' })).toThrowError(/SERVICE_ID/);
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgres://x', SERVICE_ID: 'svc' }),
    ).toThrowError(/SERVICE_HMAC_SECRET/);
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgres://x', SERVICE_ID: 'svc', SERVICE_HMAC_SECRET: 'short' }),
    ).toThrowError(/SERVICE_HMAC_SECRET/);
  });

  it('rejects an unknown ENV value', () => {
    expect(() => loadConfig({ ...REQUIRED, ENV: 'staging' })).toThrowError(/ENV/);
  });

  it('rejects an invalid LOG_LEVEL', () => {
    expect(() => loadConfig({ ...REQUIRED, LOG_LEVEL: 'loud' })).toThrowError(/LOG_LEVEL/);
  });
});
