import type { APIRoute } from 'astro';
import { apiHandler, json } from '@/lib/api';
import { getFolderCounts, listThreads } from '@/lib/threads';
import { FOLDERS, type Folder } from '@/lib/types';

export const GET: APIRoute = apiHandler(async ({ url }) => {
  const folderParam = url.searchParams.get('folder') ?? 'inbox';
  const folder: Folder | 'all' =
    folderParam === 'all' ? 'all' : FOLDERS.includes(folderParam as Folder) ? (folderParam as Folder) : 'inbox';
  const q = url.searchParams.get('q');
  const cursor = url.searchParams.get('cursor');
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);

  const [result, counts] = await Promise.all([
    listThreads({
      folder,
      q,
      cursor,
      limit: Number.isFinite(limitParam) ? limitParam : undefined,
    }),
    getFolderCounts(),
  ]);

  return json({ ...result, folder, counts });
});
