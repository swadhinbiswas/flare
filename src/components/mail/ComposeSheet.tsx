import { useEffect, useRef, useState } from 'react';
import { CalendarClock, FileUp, Loader2, Paperclip, Send, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import AddressChips from '@/components/mail/AddressChips';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatBytes } from '@/lib/format';
import { isValidEmail } from '@/lib/mail-utils';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/types';

export interface ComposeDraft {
  mode: 'new' | 'reply' | 'reply_all' | 'forward';
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  threadId?: string | null;
  inReplyTo?: string | null;
}

interface UploadedAttachment {
  id: string;
  filename: string;
  size: number;
  contentType: string;
}

interface ComposeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ComposeDraft | null;
  user: SessionUser;
  onSendStart?: (draft: ComposeDraft) => string;
  onSendError?: (tempId: string) => void;
  onSent: (result: { threadId: string; messageId: string }, tempId?: string) => void;
}

const TITLES: Record<ComposeDraft['mode'], string> = {
  new: 'New message',
  reply: 'Reply',
  reply_all: 'Reply all',
  forward: 'Forward',
};

export default function ComposeSheet({
  open,
  onOpenChange,
  draft,
  user,
  onSendStart,
  onSendError,
  onSent,
}: ComposeSheetProps) {
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTo(draft?.to ?? []);
    setCc(draft?.cc ?? []);
    setBcc(draft?.bcc ?? []);
    setShowCc(Boolean(draft?.cc?.length));
    setShowBcc(Boolean(draft?.bcc?.length));
    setSubject(draft?.subject ?? '');
    setBody(draft?.body ?? '');
    setAttachments([]);
    setScheduledAt('');
    setShowSchedule(false);
    setSending(false);
  }, [open, draft]);

  const recipientsValid =
    to.length > 0 &&
    [...to, ...cc, ...bcc].every((address) => isValidEmail(address)) &&
    (subject.trim().length > 0 || body.trim().length > 0);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('files', file);
        const response = await apiFetch<{ attachments: UploadedAttachment[] }>('/api/attachments/upload', {
          method: 'POST',
          body: form,
        });
        setAttachments((current) => [...current, ...response.attachments]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSend() {
    if (sending || !recipientsValid) return;
    const outgoing: ComposeDraft = {
      mode: draft?.mode ?? 'new',
      threadId: draft?.threadId ?? null,
      inReplyTo: draft?.inReplyTo ?? null,
      to,
      cc,
      bcc,
      subject,
      body,
    };
    const tempId = onSendStart?.(outgoing);
    setSending(true);
    try {
      const result = await apiFetch<{ threadId: string; messageId: string }>('/api/messages/send', {
        method: 'POST',
        ...jsonBody({
          to,
          cc,
          bcc,
          subject,
          text: body,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          threadId: draft?.threadId ?? undefined,
          inReplyTo: draft?.inReplyTo ?? undefined,
          attachmentIds: attachments.map((attachment) => attachment.id),
        }),
      });
      toast.success(scheduledAt ? 'Message scheduled' : 'Message sent');
      onSent(result, tempId);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sending failed';
      toast.error('Message not sent', { description: message });
      if (tempId) onSendError?.(tempId);
    } finally {
      setSending(false);
    }
  }

  const mode = draft?.mode ?? 'new';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-2xl"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void uploadFiles([...event.dataTransfer.files]);
        }}
      >
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>{TITLES[mode]}</SheetTitle>
          <SheetDescription className="text-xs">
            From <span className="text-foreground">{user.email}</span>
            {uploading ? ' · uploading attachment…' : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <AddressChips label="To" value={to} onChange={setTo} placeholder="recipient@example.com" autoFocus={mode === 'new'} />
          {showCc ? <AddressChips label="Cc" value={cc} onChange={setCc} placeholder="cc@example.com" /> : null}
          {showBcc ? <AddressChips label="Bcc" value={bcc} onChange={setBcc} placeholder="bcc@example.com" /> : null}
          {!showCc || !showBcc ? (
            <div className="flex gap-3 text-xs">
              {!showCc ? (
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setShowCc(true)}>
                  Add Cc
                </button>
              ) : null}
              {!showBcc ? (
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setShowBcc(true)}>
                  Add Bcc
                </button>
              ) : null}
            </div>
          ) : null}

          <Input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
            aria-label="Subject"
          />

          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Write your message… (markdown-lite: **bold**, *italic*, `code`)"
            className="min-h-64 resize-y"
            aria-label="Message body"
          />

          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="bg-muted/60 border-border/60 inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
                >
                  <Paperclip className="size-3.5" />
                  <span className="max-w-52 truncate font-medium">{attachment.filename}</span>
                  <span className="text-muted-foreground">{formatBytes(attachment.size)}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                    aria-label={`Remove ${attachment.filename}`}
                    className="hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {dragging ? (
          <div className="border-primary text-primary bg-primary/5 pointer-events-none absolute inset-4 z-10 grid place-items-center rounded-xl border-2 border-dashed text-sm font-medium">
            <span className="flex items-center gap-2">
              <FileUp className="size-4" /> Drop files to attach
            </span>
          </div>
        ) : null}

        {showSchedule ? (
          <div className="border-t px-5 py-3">
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium" htmlFor="send-at">
              Deliver at
            </label>
            <Input
              id="send-at"
              type="datetime-local"
              value={scheduledAt}
              min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Leave empty to send immediately. Scheduled mail can be canceled from the conversation.
            </p>
          </div>
        ) : null}

        <SheetFooter className="border-t px-5 py-4">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              void uploadFiles([...(event.target.files ?? [])]);
              event.target.value = '';
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-muted-foreground"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
                Attach
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSchedule((value) => !value)}
                className={showSchedule ? 'text-primary' : 'text-muted-foreground'}
              >
                <CalendarClock className="size-4" />
                Send later
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground hidden text-[11px] sm:inline">⌘↵ to send</span>
              <Button
                onClick={() => void handleSend()}
                disabled={sending || uploading || !recipientsValid || (showSchedule && !scheduledAt)}
                className={cn(!recipientsValid && 'opacity-60')}
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {sending ? 'Working…' : scheduledAt ? 'Schedule' : 'Send'}
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
