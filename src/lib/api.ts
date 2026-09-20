import type { APIContext } from 'astro';

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: message, ...extra }, { status });
}

export const unauthorized = () => errorResponse(401, 'Not authenticated');
export const forbidden = () => errorResponse(403, 'Forbidden');
export const notFound = (what = 'Not found') => errorResponse(404, what);
export const badRequest = (message: string) => errorResponse(400, message);
export const methodNotAllowed = (allowed: string[]) =>
  errorResponse(405, 'Method not allowed', { allowed });

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Wrap an API handler so unexpected exceptions become clean 500 JSON. */
export function apiHandler(handler: (context: APIContext) => Promise<Response>) {
  return async (context: APIContext): Promise<Response> => {
    try {
      return await handler(context);
    } catch (error) {
      console.error('[api] unhandled error', error);
      const message = error instanceof Error ? error.message : 'Internal error';
      return errorResponse(500, message);
    }
  };
}
