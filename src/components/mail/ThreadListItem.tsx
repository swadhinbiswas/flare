import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { relativeTime, initials } from '@/lib/format';
import { emailOf, nameOf } from '@/lib/mail-utils';
import { isTerminalBad } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { MessageStatus, ThreadSummaryDto } from '@/lib/types';

const STATUS_DOT: Record<MessageStatus, string> = {
  queued: 'bg-[var(--warning)] animate-pulse',
  scheduled: 'bg-[var(--warning)]',
  canceled: 'bg-muted-foreground/40',
  sent: 'bg-primary/70',
  delivered: 'bg-[var(--success)]',
  delivery_delayed: 'bg-[var(--warning)]',
  opened: 'bg-[var(--success)]',
  clicked: 'bg-[var(--success)]',
  received: 'bg-muted-foreground/40',
  bounced: 'bg-destructive',
  complained: 'bg-destructive',
  failed: 'bg-destructive',
};

interface ThreadListItemProps {
  thread: ThreadSummaryDto;
  selected: boolean;
  focused?: boolean;
  onClick: () => void;
}

export default function ThreadListItem({ thread, selected, focused = false, onClick }: ThreadListItemProps) {
  const unread = thread.unreadCount > 0;
  const lastFrom = thread.lastFrom ? nameOf(thread.lastFrom) : 'Unknown sender';
  const lastEmail = thread.lastFrom ? emailOf(thread.lastFrom) : '';
  const displayName = thread.lastDirection === 'outbound' ? 'You' : lastFrom;

  return (
    <button
      type="button"
      onClick={onClick}
      data-thread-id={thread.id}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'group relative flex w-full items-start gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors',
        selected ? 'bg-accent/70' : 'hover:bg-accent/40',
        focused && !selected && 'bg-accent/30 ring-primary/40 ring-1 ring-inset',
      )}
    >
      {unread ? <span aria-hidden className="bg-primary absolute inset-y-2 left-0 w-0.5 rounded-full" /> : null}

      <Avatar className="mt-0.5 size-8 shrink-0">
        <AvatarFallback className={cn(unread && 'bg-primary/15 text-primary')}>
          {initials(displayName === 'You' ? lastEmail : lastFrom)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-medium text-foreground/90')}>
            {displayName}
          </span>
          <span className={cn('shrink-0 text-[11px]', unread ? 'text-primary font-medium' : 'text-muted-foreground')}>
            {relativeTime(thread.lastMessageAt)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          {thread.lastStatus ? (
            <span
              aria-hidden
              className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[thread.lastStatus])}
              title={
                isTerminalBad(thread.lastStatus)
                  ? thread.lastStatus
                  : thread.lastStatus === 'queued'
                    ? 'sending'
                    : thread.lastStatus
              }
            />
          ) : null}
          <span className={cn('truncate text-xs', unread ? 'text-foreground/90' : 'text-foreground/70')}>
            {thread.subject ? thread.subject : '(no subject)'}
          </span>
        </div>

        <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">{thread.preview || 'No preview'}</p>
      </div>

      {thread.messageCount > 1 ? (
        <span className="text-muted-foreground bg-muted/60 mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
          {thread.messageCount}
        </span>
      ) : null}
    </button>
  );
}
