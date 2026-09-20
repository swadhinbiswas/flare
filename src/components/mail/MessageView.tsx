import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Forward,
  Loader2,
  Mail,
  MailOpen,
  Reply,
  ReplyAll,
  Trash2,
  TrashIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import MessageBubble from '@/components/mail/MessageBubble';
import { emailOf, nameOf, normalizeSubject } from '@/lib/mail-utils';
import type { MessageDto, ThreadDetailDto } from '@/lib/types';

interface MessageViewProps {
  detail: ThreadDetailDto | null;
  loading: boolean;
  showBack?: boolean;
  onBack?: () => void;
  onReply: (message: MessageDto) => void;
  onReplyAll: (message: MessageDto) => void;
  onForward: (message: MessageDto) => void;
  onToggleMessageRead: (message: MessageDto) => void;
  onToggleThreadRead: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onDeleteForever: () => void;
}

function ActionButton({
  label,
  onClick,
  children,
  destructive = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          className={destructive ? 'text-destructive hover:text-destructive' : undefined}
        >
          {children}
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function MessageView({
  detail,
  loading,
  showBack = false,
  onBack,
  onReply,
  onReplyAll,
  onForward,
  onToggleMessageRead,
  onToggleThreadRead,
  onArchive,
  onTrash,
  onDeleteForever,
}: MessageViewProps) {
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowAll(false);
  }, [detail?.thread.id]);

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [detail?.thread.id, detail?.messages.length]);

  if (loading && !detail) {
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Separator />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="bg-muted/50 grid size-12 place-items-center rounded-full">
          <Mail className="size-5" />
        </div>
        <div>
          <p className="text-foreground text-sm font-medium">No conversation selected</p>
          <p className="mt-1 max-w-xs text-xs">
            Pick a thread from the list, or press <kbd className="bg-muted rounded px-1">c</kbd> to compose a new
            message.
          </p>
        </div>
      </div>
    );
  }

  const { thread, messages } = detail;
  const collapsedCount = messages.length > 3 && !showAll ? messages.length - 2 : 0;
  const visibleMessages = collapsedCount > 0 ? messages.slice(collapsedCount) : messages;
  const hiddenMessages = collapsedCount > 0 ? messages.slice(0, collapsedCount) : [];
  const inTrash = thread.folder === 'trash';
  const inArchive = thread.folder === 'archive';
  const hasUnread = thread.unreadCount > 0;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="bg-background/80 supports-[backdrop-filter]:bg-background/65 sticky top-0 z-10 border-b backdrop-blur">
        <div className="flex items-start gap-2 px-4 pt-3 pb-2">
          {showBack ? (
            <Button variant="ghost" size="icon-sm" onClick={onBack} className="mt-0.5 shrink-0">
              <ArrowLeft className="size-4" />
              <span className="sr-only">Back to list</span>
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight">
              {normalizeSubject(thread.subject) || '(no subject)'}
            </h1>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {thread.participants.map((address) => nameOf(address)).join(', ')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <ActionButton
              label={hasUnread ? 'Mark thread read' : 'Mark thread unread'}
              onClick={onToggleThreadRead}
            >
              {hasUnread ? <MailOpen className="size-4" /> : <Mail className="size-4" />}
            </ActionButton>
            {!inArchive ? (
              <ActionButton label="Archive" onClick={onArchive}>
                <Archive className="size-4" />
              </ActionButton>
            ) : (
              <ActionButton label="Move back to inbox" onClick={onArchive}>
                <ArchiveRestore className="size-4" />
              </ActionButton>
            )}
            {!inTrash ? (
              <ActionButton label="Move to trash" onClick={onTrash}>
                <Trash2 className="size-4" />
              </ActionButton>
            ) : (
              <ActionButton label="Delete forever" onClick={onDeleteForever} destructive>
                <TrashIcon className="size-4" />
              </ActionButton>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 pb-3">
          <Button size="sm" onClick={() => onReply(messages[messages.length - 1] as MessageDto)}>
            <Reply className="size-3.5" /> Reply
          </Button>
          <Button variant="outline" size="sm" onClick={() => onReplyAll(messages[messages.length - 1] as MessageDto)}>
            <ReplyAll className="size-3.5" /> Reply all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onForward(messages[messages.length - 1] as MessageDto)}
          >
            <Forward className="size-3.5" /> Forward
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-3 p-4">
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2 px-2 text-xs">
              <Loader2 className="size-3.5 animate-spin" /> Refreshing…
            </div>
          ) : null}

          {hiddenMessages.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 self-start rounded-full px-3 py-1 text-xs transition-colors"
            >
              Show {hiddenMessages.length} earlier {hiddenMessages.length === 1 ? 'message' : 'messages'}
            </button>
          ) : null}

          {hiddenMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onReply={onReply}
              onReplyAll={onReplyAll}
              onForward={onForward}
              onToggleRead={onToggleMessageRead}
            />
          ))}

          {visibleMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onReply={onReply}
              onReplyAll={onReplyAll}
              onForward={onForward}
              onToggleRead={onToggleMessageRead}
            />
          ))}

          <p className="text-muted-foreground px-1 pt-1 text-center text-[11px]">
            You're viewing a conversation with {thread.participants.map(emailOf).join(', ')}
          </p>
        </div>
        </ScrollArea>
      </div>
    </div>
  );
}
