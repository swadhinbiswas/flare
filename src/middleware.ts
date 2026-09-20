import { defineMiddleware } from 'astro:middleware';
import { readSessionCookie, verifySessionCookie } from './lib/auth';
import { unauthorized } from './lib/api';

/**
 * Every route is gated except:
 *   - /login (and the login POST),
 *   - /api/webhooks/* (authenticated by Svix signature instead),
 *   - static assets.
 *
 * Both pages and API routes enforce the session; API routes get JSON 401s while
 * pages are redirected to /login?next=<path>.
 */
const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout']);
const PUBLIC_PREFIXES = ['/api/webhooks/'];
const ASSET_RE = /\.(svg|png|jpe?g|gif|webp|avif|ico|webmanifest|txt|xml|css|js|mjs|map|woff2?|ttf)$/i;

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (pathname.startsWith('/_astro/') || pathname.startsWith('/_image')) return true;
  if (ASSET_RE.test(pathname)) return true;
  return false;
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('x-frame-options', 'DENY');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'same-origin');
  headers.set('x-robots-tag', 'noindex, nofollow');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const token = readSessionCookie(context.request.headers.get('cookie'));
  const user = token ? await verifySessionCookie(token) : null;
  context.locals.user = user;

  if (isPublic(pathname)) {
    return withSecurityHeaders(await next());
  }

  if (!user) {
    if (pathname.startsWith('/api/')) return unauthorized();
    const nextPath = `${pathname}${context.url.search}`;
    return context.redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return withSecurityHeaders(await next());
});
