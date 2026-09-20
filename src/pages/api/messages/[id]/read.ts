import type { APIRoute } from 'astro';
import { apiHandler, badRequest, json, notFound, readJsonBody } from '@/lib/api';
import { markMessageRead } from '@/lib/threads';

export const POST: APIRoute = apiHandler(async ({ params, request }) => {
  const id = params.id;
  if (!id) return badRequest('Missing message id.');
  const body = await readJsonBody<{ read?: boolean }>(request);
  const isRead = body?.read ?? true;
  const result = await markMessageRead(id, isRead);
  if (!result) return notFound('Message not found');
  return json(result);
});
