import type { APIRoute } from 'astro';
import { apiHandler, badRequest, errorResponse, json } from '@/lib/api';
import { MAX_ATTACHMENT_BYTES, putObject, sanitizeFilename } from '@/lib/attachments';
import { run } from '@/lib/db';
import { nowIso } from '@/lib/threads';

const MAX_FILES = 10;

/**
 * Streams an outbound attachment straight into R2 and records an unclaimed
 * `attachments` row. The compose client references the returned id in the send
 * payload; the send handler then claims the row and encodes the bytes for Resend.
 */
export const POST: APIRoute = apiHandler(async ({ request }) => {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return badRequest('Expected multipart/form-data.');
  }

  const form = await request.formData();
  const files = [...form.getAll('files'), ...form.getAll('file')].filter((value): value is File => value instanceof File);
  if (files.length === 0) return badRequest('No file provided.');
  if (files.length > MAX_FILES) return badRequest(`At most ${MAX_FILES} files per upload.`);

  const uploaded: { id: string; filename: string; size: number; contentType: string }[] = [];

  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return errorResponse(413, `"${file.name}" is larger than ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB.`);
    }
    const filename = sanitizeFilename(file.name || 'attachment');
    const id = crypto.randomUUID();
    const key = `outbound/${id}/${filename}`;
    const buffer = await file.arrayBuffer();
    await putObject(key, buffer, file.type || 'application/octet-stream');
    await run(
      `INSERT INTO attachments (id, message_id, filename, content_type, size_bytes, r2_key, content_id, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, NULL, ?)`,
      [id, filename, file.type || 'application/octet-stream', buffer.byteLength, key, nowIso()],
    );
    uploaded.push({
      id,
      filename,
      size: buffer.byteLength,
      contentType: file.type || 'application/octet-stream',
    });
  }

  return json({ attachments: uploaded });
});
