import type { APIRoute } from 'astro';
import { apiHandler, badRequest, json, methodNotAllowed, notFound } from '@/lib/api';
import {
  deleteThread,
  getFolderCounts,
  getThreadDetail,
  moveThread,
  threadAttachmentKeys,
  threadBelongsToAccount,
} from '@/lib/threads';
import { FOLDERS, type Folder } from '@/lib/types';
import { getActiveAccount } from '@/lib/accounts';

export const GET: APIRoute = apiHandler(async ({ params, url, request }) => {
  const id = params.id;
  if (!id) return badRequest('Missing thread id.');
  const markRead = url.searchParams.get('markRead') !== '0';
  // Sequential: opening a thread can clear its unread count, and the counts we
  // return must reflect that side effect.
  const account = await getActiveAccount(request.headers.get('cookie'));
  const detail = await getThreadDetail(id, { markRead, accountId: account.id });
  if (!detail) return notFound('Thread not found');
  const counts = await getFolderCounts(account.id);
  return json({ ...detail, counts });
});

export const PATCH: APIRoute = apiHandler(async ({ params, request }) => {
  const id = params.id;
  if (!id) return badRequest('Missing thread id.');
  const account = await getActiveAccount(request.headers.get('cookie'));
  if (!(await threadBelongsToAccount(id, account.id))) return notFound('Thread not found');
  const body = (await request.json().catch(() => null)) as { folder?: string } | null;
  const folder = body?.folder as Folder | undefined;
  if (!folder || !FOLDERS.includes(folder)) {
    return badRequest(`folder must be one of: ${FOLDERS.join(', ')}`);
  }
  const thread = await moveThread(id, folder);
  if (!thread) return notFound('Thread not found');
  return json({ thread });
});

export const DELETE: APIRoute = apiHandler(async ({ params, request }) => {
  const id = params.id;
  if (!id) return badRequest('Missing thread id.');
  const account = await getActiveAccount(request.headers.get('cookie'));
  if (!(await threadBelongsToAccount(id, account.id))) return notFound('Thread not found');
  const keys = await threadAttachmentKeys(id);
  await deleteThread(id, keys);
  return json({ ok: true });
});

export const ALL: APIRoute = async () => methodNotAllowed(['GET', 'PATCH', 'DELETE']);
