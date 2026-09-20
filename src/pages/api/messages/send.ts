import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiHandler, badRequest, errorResponse, json, readJsonBody } from '@/lib/api';
import { SendError, sendMessage } from '@/lib/send';
import type { SendMessageInput } from '@/lib/types';

export const POST: APIRoute = apiHandler(async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return errorResponse(401, 'Not authenticated');

  const input = await readJsonBody<SendMessageInput>(request);
  if (!input) return badRequest('Invalid JSON body.');

  try {
    const result = await sendMessage({
      user,
      input,
      displayName: env.MAIL_FROM_NAME || 'RFLARE',
    });
    return json(result);
  } catch (error) {
    if (error instanceof SendError) {
      return errorResponse(502, error.message, { detail: error.detail });
    }
    throw error;
  }
});
