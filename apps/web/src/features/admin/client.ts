/** Client-side admin API helpers. Every mutating call carries the
 *  X-Admin-Request marker the BFF requires (CSRF defense-in-depth). */

export interface AdminError {
  code: string;
  message: string;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Request': '1',
      ...init.headers,
    },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (body as { error?: AdminError })?.error;
    throw new Error(err?.message ?? 'Възникна грешка');
  }
  return body as T;
}

export const adminApi = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
};
