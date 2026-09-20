import { Loader2, RefreshCw, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import ThreadListItem from '@/components/mail/ThreadListItem';
import { cn } from '@/lib/utils';
import type { Folder, ThreadSummaryDto } from '@/lib/types';

const EMPTY_COPY: Record<Folder, { title: string; hint: string }> = {
  inbox: { title: 'Inbox zero', hint: 'Nothing waiting on you. Enjoy it.' },
  sent: { title: 'No sent mail', hint: 'Messages you send will appear here.' },
  archive: { title: 'Nothing archived', hint: 'Archive threads to get them out of the inbox.' },
  trash: { title: 'Trash is empty', hint: 'Deleted threads sit here until you remove them forever.' },
};

interface ThreadListProps {
  folder: Folder;
  threads: ThreadSummaryDto[];
  selectedId: string | null;
  focusedId: string | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export default function ThreadList({
  folder,
  threads,
  selectedId,
  focusedId,
  loading,
  loadingMore,
  hasMore,
  query,
  onQueryChange,
  onSelect,
  onLoadMore,
  onRefresh,
  searchInputRef,
}: ThreadListProps) {
  const empty = !loading && threads.length === 0;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="border-b p-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search mail…"
            className="h-8 pr-8 pl-8 text-sm"
            aria-label="Search mail"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="flex items-start gap-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : empty ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
            <p className="text-foreground text-sm font-medium">
              {query ? `No results for “${query}”` : EMPTY_COPY[folder].title}
            </p>
            <p className="max-w-[22ch] text-xs">{query ? 'Try a different search term.' : EMPTY_COPY[folder].hint}</p>
          </div>
        ) : (
          <>
            {threads.map((thread) => (
              <ThreadListItem
                key={thread.id}
                thread={thread}
                selected={thread.id === selectedId}
                focused={thread.id === focusedId}
                onClick={() => onSelect(thread.id)}
              />
            ))}

            {hasMore ? (
              <div className="p-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="border-t p-2">
        <Button variant="ghost" size="sm" className="text-muted-foreground w-full" onClick={onRefresh}>
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>
    </div>
  );
}
