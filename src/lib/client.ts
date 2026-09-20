/** Tiny fetch wrapper for the browser islands. */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // Only default to JSON for string bodies; FormData must keep its boundary.
  if (typeof init.body === 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(url, { ...init, headers });
  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
  const body = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : null) ?? `Request failed (${response.status})`;
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(message, response.status);
  }

  return body as T;
}

export function jsonBody(value: unknown): RequestInit {
  return { body: JSON.stringify(value) };
}
