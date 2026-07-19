/**
 * @familytree/shared — code shared between the Vercel BFF (apps/web) and the
 * Oracle API (services/api). Ships as TypeScript source; consumers compile it
 * (tsx/esbuild in the API, Next.js `transpilePackages` in the web app).
 *
 * Task 13 adds the shared questionnaire Zod schemas.
 */
export const SHARED_PACKAGE = '@familytree/shared';
export const SHARED_VERSION = '0.1.0';

export * from './hmac';
