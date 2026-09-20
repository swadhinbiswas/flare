import { CheckCircle2, Circle, CircleSlash, Clock, AlertTriangle, XCircle, MailCheck, MousePointerClick } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { STATUS_RANK } from '@/lib/status';
import { fullDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { EmailEventDto, MessageStatus } from '@/lib/types';

const STEPS: { key: MessageStatus; label: string; icon: typeof Circle }[] = [
  { key: 'sent', label: 'Sent', icon: MailCheck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
  { key: 'opened', label: 'Opened', icon: Circle },
  { key: 'clicked', label: 'Clicked', icon: MousePointerClick },
];

const EVENT_FOR_STATUS: Partial<Record<MessageStatus, string>> = {
  sent: 'email.sent',
  delivered: 'email.delivered',
  opened: 'email.opened',
  clicked: 'email.clicked',
  bounced: 'email.bounced',
  complained: 'email.complained',
  failed: 'email.failed',
  delivery_delayed: 'email.delivery_delayed',
};

function eventTime(events: EmailEventDto[], status: MessageStatus): string | null {
  const type = EVENT_FOR_STATUS[status];
  if (!type) return null;
  const match = [...events].reverse().find((event) => event.type === type);
  return match ? fullDateTime(match.createdAt) : null;
}

interface StatusTimelineProps {
  status: MessageStatus;
  events: EmailEventDto[];
  className?: string;
}

/** Compact horizontal step indicator: Sent → Delivered → Opened → Clicked. */
export default function StatusTimeline({ status, events, className }: StatusTimelineProps) {
  const bad = status === 'bounced' || status === 'complained' || status === 'failed';

  if (status === 'scheduled') {
    return (
      <span className={cn('text-warning inline-flex items-center gap-1.5 text-xs font-medium', className)}>
        <Clock className="size-3.5" />
        Scheduled
      </span>
    );
  }

  if (status === 'canceled') {
    return (
      <span className={cn('text-muted-foreground inline-flex items-center gap-1.5 text-xs', className)}>
        <CircleSlash className="size-3.5" />
        Canceled
      </span>
    );
  }

  if (status === 'queued') {
    return (
      <span className={cn('text-muted-foreground inline-flex items-center gap-1.5 text-xs', className)}>
        <Clock className="size-3.5 animate-pulse" />
        Sending…
      </span>
    );
  }

  if (bad) {
    const Icon = status === 'failed' ? XCircle : AlertTriangle;
    const label = status === 'bounced' ? 'Bounced' : status === 'complained' ? 'Complained' : 'Failed';
    const time = eventTime(events, status);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-destructive inline-flex cursor-default items-center gap-1.5 text-xs font-medium">
            <Icon className="size-3.5" />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent>{time ?? label}</TooltipContent>
      </Tooltip>
    );
  }

  if (status === 'delivery_delayed') {
    const time = eventTime(events, 'delivery_delayed');
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-warning inline-flex cursor-default items-center gap-1.5 text-xs font-medium">
            <Clock className="size-3.5" />
            Delayed
          </span>
        </TooltipTrigger>
        <TooltipContent>{time ?? 'Delivery delayed'}</TooltipContent>
      </Tooltip>
    );
  }

  const currentRank = STATUS_RANK[status] ?? 0;

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {STEPS.map((step, index) => {
        const rank = STATUS_RANK[step.key];
        const reached = currentRank >= rank;
        const time = eventTime(events, step.key);
        return (
          <span key={step.key} className="inline-flex items-center">
            {index > 0 ? (
              <span
                aria-hidden
                className={cn('mx-1 h-px w-3', reached ? 'bg-[var(--success)]/60' : 'bg-border')}
              />
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex cursor-default items-center gap-1 text-[11px]',
                    reached ? 'text-[var(--success)]' : 'text-muted-foreground/60',
                  )}
                >
                  <step.icon className="size-3.5" />
                  <span className={cn(reached ? 'font-medium' : 'font-normal')}>{step.label}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>{time ?? `${step.label} (pending)`}</TooltipContent>
            </Tooltip>
          </span>
        );
      })}
    </span>
  );
}
