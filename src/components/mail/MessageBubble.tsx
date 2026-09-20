import {
  Download,
  Forward,
  Mail,
  MailOpen,
  MoreHorizontal,
  Reply,
  ReplyAll,
  UserRound,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import HtmlFrame from '@/components/mail/HtmlFrame';
import StatusTimeline from '@/components/mail/StatusTimeline';
import { fullDateTime, formatBytes, initials, timeOfDay } from '@/lib/format';
import { emailOf, nameOf } from '@/lib/mail-utils';
import { cn } from '@/lib/utils';
import type { MessageDto } from '@/lib/types';

interface MessageBubbleProps {
  message: MessageDto;
  avatarUrl?: string | null;
  onReply: (message: MessageDto) => void;
  onReplyAll: (message: MessageDto) => void;
  onForward: (message: MessageDto) => void;
  onToggleRead: (message: MessageDto) => void;
}

export default function MessageBubble({
  message,
  avatarUrl,
  onReply,
  onReplyAll,
  onForward,
  onToggleRead,
}: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const fromName = isOutbound ? 'You' : nameOf(message.from);
  const fromEmail = emailOf(message.from);
  const attachments = message.attachments ?? [];

  return (
    <article
      id={`message-${message.id}`}
      className={cn(
        'group/message border-border/60 rounded-xl border p-4 shadow-xs transition-colors',
        isOutbound ? 'bg-primary/[0.04]' : 'bg-card',
      )}
    >
      <header className="flex items-start gap-3">
        <Avatar className="mt-0.5 size-8">
          {isOutbound && avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className={cn(isOutbound && 'bg-primary/15 text-primary')}>
            {initials(fromName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold">{fromName}</span>
            <span className="text-muted-foreground truncate text-xs">&lt;{fromEmail}&gt;</span>
          </div>
          <p className="text-muted-foreground truncate text-xs">
            to {message.to.map(emailOf).join(', ')}
            {message.cc.length ? ` · cc ${message.cc.map(emailOf).join(', ')}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <time className="text-muted-foreground text-xs" title={fullDateTime(message.createdAt)}>
            {timeOfDay(message.createdAt)}
          </time>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="opacity-0 transition-opacity group-hover/message:opacity-100 data-[state=open]:opacity-100">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Message actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onReply(message)}>
                <Reply /> Reply
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReplyAll(message)}>
                <ReplyAll /> Reply all
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onForward(message)}>
                <Forward /> Forward
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onToggleRead(message)}>
                {message.isRead ? <Mail /> : <MailOpen />}
                Mark as {message.isRead ? 'unread' : 'read'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void navigator.clipboard?.writeText(fromEmail);
                }}
              >
                <UserRound /> Copy sender address
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="mt-3 pl-11">
        {message.html ? (
          <HtmlFrame html={message.html} />
        ) : (
          <pre className="font-sans text-sm whitespace-pre-wrap">{message.text ?? ''}</pre>
        )}

        {attachments.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={`/api/attachments/${attachment.id}`}
                className="bg-muted/60 hover:bg-muted border-border/60 inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
                download
              >
                <Download className="size-3.5 shrink-0" />
                <span className="truncate font-medium">{attachment.filename}</span>
                {attachment.size != null ? (
                  <span className="text-muted-foreground shrink-0">{formatBytes(attachment.size)}</span>
                ) : null}
                {attachment.contentId ? (
                  <Badge variant="outline" className="shrink-0 px-1 py-0 text-[10px]">
                    inline
                  </Badge>
                ) : null}
              </a>
            ))}
          </div>
        ) : null}

        {isOutbound ? (
          <div className="border-border/60 mt-3 flex items-center justify-between gap-3 border-t pt-2">
            <StatusTimeline status={message.status} events={message.events} />
            <span className="text-muted-foreground text-[11px]">{fullDateTime(message.createdAt)}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
