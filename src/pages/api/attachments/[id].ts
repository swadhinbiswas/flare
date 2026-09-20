import type { APIRoute } from 'astro';
import { apiHandler, forbidden, notFound, unauthorized } from '@/lib/api';
import { canUserAccessAttachment, getObject } from '@/lib/attachments';
import { queryOne } from '@/lib/db';
import type { AttachmentRow } from '@/lib/types';

/**
 * Auth-gated R2 stream. R2 keys are never public; the middleware has already
 * validated the session, and canUserAccessAttachment() states the ownership rule
 * (single-tenant: any signed-in mailbox user).
 */
export const GET: APIRoute = apiHandler(async ({ params, url, locals }) => {
  const user = locals.user;
  if (!user) return unauthorized();

  const id = params.id;
  if (!id) return notFound('Attachment not found');

  const row = await queryOne<AttachmentRow>('SELECT * FROM attachments WHERE id = ?', [id]);
  if (!row) return notFound('Attachment not found');
  if (!(await canUserAccessAttachment(user, row))) return forbidden();

  const object = await getObject(row.r2_key);
  if (!object) return notFound('Attachment blob missing from storage');

  const inline = url.searchParams.get('inline') === '1';
  const headers = new Headers();
  headers.set('content-type', object.httpMetadata?.contentType || row.content_type || 'application/octet-stream');
  headers.set('content-length', String(object.size));
  headers.set('cache-control', 'private, max-age=86400');
  headers.set('content-disposition', inline ? 'inline' : `attachment; filename="${encodeURIComponent(row.filename)}"`);

  return new Response(object.body, { headers });
});
