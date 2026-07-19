import { pino, type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string, env: 'dev' | 'prod'): Logger {
  return pino({
    level,
    // Pretty output is a dev convenience only; production stays raw JSON.
    ...(env === 'dev' ? { transport: { target: 'pino-pretty' } } : {}),
  });
}
