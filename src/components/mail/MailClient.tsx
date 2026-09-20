import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { TooltipProvider } from '@/components/ui/tooltip';
import CommandPalette from '@/components/mail/CommandPalette';
import ComposeSheet, { type ComposeDraft } from '@/components/mail/ComposeSheet';
import FolderNav from '@/components/mail/FolderNav';
import MessageView from '@/components/mail/MessageView';
import MobileNav from '@/components/mail/MobileNav';
import ThreadList from '@/components/mail/ThreadList';
import { apiFetch, jsonBody } from '@/lib/client';
import { fullDateTime } from '@/lib/format';
import { useIsMobile } from '@/hooks/use-mobile';
import { emailOf, htmlToPreview, normalizeSubject } from '@/lib/mail-utils';
import type { FolderCounts } from '@/lib/threads';
import type { Folder, MessageDto, SessionUser, ThreadDetailDto, ThreadListResponse, ThreadSummaryDto } from '@/lib/types';

type ThreadListResponseWithCounts = ThreadListResponse & { counts: FolderCounts };
type ThreadDetailResponse = ThreadDetailDto & { counts: FolderCounts };

interface MailClientProps {
  user: SessionUser;
  folder: Folder;
  initialThreads: ThreadSummaryDto[];
  initialNextCursor: string | null;
  initialCounts: FolderCounts;
  initialThreadId?: string | null;
  initialThread?: ThreadDetailDto | null;
}

function buildReplyDraft(user: SessionUser, message: MessageDto, mode: 'reply' | 'reply_all' | 'forward'): ComposeDraft {
  const self = user.email.toLowerCase();
  const subjectBase = normalizeSubject(message.subject) || '(no subject)';

  if (mode === 'forward') {
    const quoted = (message.text ?? htmlToPreview(message.html) ?? '').trim();
    return {
      mode,
      to: [],
      cc: [],
      bcc: [],
      subject: `Fwd: ${subjectBase}`,
      body: `\n\n---------- Forwarded message ----------\nFrom: ${message.from}\nDate: ${fullDateTime(message.createdAt)}\nSubject: ${message.subject}\n\n${quoted}`,
      threadId: null,
      inReplyTo: null,
    };
  }

  const replyTo = message.direction === 'inbound' ? [emailOf(message.from)] : [];
  const to = replyTo.length > 0 ? replyTo : message.to.map(emailOf).filter((address) => address !== self);
  const cc =
    mode === 'reply_all'
      ? [...message.to, ...message.cc]
          .map(emailOf)
          .filter((address) => address && address !== self && !to.includes(address))
      : [];

  return {
    mode,
    to,
    cc,
    bcc: [],
    subject: `Re: ${subjectBase}`,
    body: '',
    threadId: message.threadId,
    inReplyTo: message.messageIdHeader,
  };
}

export default function MailClient(props: MailClientProps) {
  const { user, folder } = props;

  const [threads, setThreads] = useState(props.initialThreads);
  const [nextCursor, setNextCursor] = useState(props.initialNextCursor);
  const [counts, setCounts] = useState(props.initialCounts);
  const [selectedId, setSelectedId] = useState<string | null>(props.initialThreadId ?? null);
  const [focusedId, setFocusedId] = useState<string | null>(props.initialThreadId ?? null);
  const [detail, setDetail] = useState<ThreadDetailDto | null>(props.initialThread ?? null);
  const [listLoading, setListLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState<ComposeDraft | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<'list' | 'thread'>(props.initialThreadId ? 'thread' : 'list');

  const searchRef = useRef<HTMLInputElement>(null);
  const didMount = useRef(false);
  const queryRef = useRef(query);
  queryRef.current = query;

  const isMobile = useIsMobile();

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((previous) => {
      const next = previous === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try {
        localStorage.setItem('rflare-theme', next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // --- Data loading ---------------------------------------------------------
  const loadThreads = useCallback(
    async (options: { q?: string; append?: boolean } = {}) => {
      const search = options.q ?? queryRef.current;
      if (options.append) setLoadingMore(true);
      else setListLoading(true);
      try {
        const params = new URLSearchParams({ folder });
        if (search) params.set('q', search);
        if (options.append && nextCursor) params.set('cursor', nextCursor);
        const data = await apiFetch<ThreadListResponseWithCounts>(`/api/threads?${params.toString()}`);
        setThreads((previous) => (options.append ? [...previous, ...data.threads] : data.threads));
        setNextCursor(data.nextCursor);
        setCounts(data.counts);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not load threads');
      } finally {
        setListLoading(false);
        setLoadingMore(false);
      }
    },
    [folder, nextCursor],
  );

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const value = query.trim();
    const timer = setTimeout(() => void loadThreads({ q: value }), 220);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const openThread = useCallback(async (id: string) => {
    setSelectedId(id);
    setFocusedId(id);
    setMobilePane('thread');
    setDetailLoading(true);
    try {
      const data = await apiFetch<ThreadDetailResponse>(`/api/threads/${id}`);
      setDetail(data);
      setCounts(data.counts);
      setThreads((previous) => previous.map((thread) => (thread.id === id ? { ...thread, unreadCount: 0 } : thread)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open conversation');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (!selectedId) return;
    try {
      const data = await apiFetch<ThreadDetailResponse>(`/api/threads/${selectedId}`);
      setDetail(data);
      setCounts(data.counts);
    } catch {
      // keep the current view
    }
  }, [selectedId]);

  // --- Thread actions -------------------------------------------------------
  const moveThread = useCallback(
    async (id: string, target: Folder, message: string) => {
      try {
        await apiFetch(`/api/threads/${id}`, { method: 'PATCH', ...jsonBody({ folder: target }) });
        toast.success(message);
        if (id === selectedId) {
          setSelectedId(null);
          setDetail(null);
          setMobilePane('list');
        }
        await loadThreads({ q: queryRef.current.trim() });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not move conversation');
      }
    },
    [selectedId, loadThreads],
  );

  const deleteThreadForever = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/api/threads/${id}`, { method: 'DELETE' });
        toast.success('Deleted forever');
        if (id === selectedId) {
          setSelectedId(null);
          setDetail(null);
          setMobilePane('list');
        }
        await loadThreads({ q: queryRef.current.trim() });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not delete conversation');
      }
    },
    [selectedId, loadThreads],
  );

  const toggleMessageRead = useCallback(
    async (message: MessageDto) => {
      try {
        const result = await apiFetch<{ threadId: string; unreadCount: number }>(
          `/api/messages/${message.id}/read`,
          { method: 'POST', ...jsonBody({ read: !message.isRead }) },
        );
        setDetail((previous) =>
          previous
            ? {
                ...previous,
                thread: { ...previous.thread, unreadCount: result.unreadCount },
                messages: previous.messages.map((item) =>
                  item.id === message.id ? { ...item, isRead: !message.isRead } : item,
                ),
              }
            : previous,
        );
        if (result.threadId === selectedId) await refreshDetail();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not update message');
      }
    },
    [selectedId, refreshDetail],
  );

  const toggleThreadRead = useCallback(async () => {
    if (!detail) return;
    const unread = detail.thread.unreadCount > 0;
    const targets = unread
      ? detail.messages.filter((message) => message.direction === 'inbound' && !message.isRead)
      : [...detail.messages].reverse().filter((message) => message.direction === 'inbound').slice(0, 1);
    try {
      await Promise.all(
        targets.map((message) =>
          apiFetch(`/api/messages/${message.id}/read`, { method: 'POST', ...jsonBody({ read: !unread }) }),
        ),
      );
      await openThread(detail.thread.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update conversation');
    }
  }, [detail, openThread]);

  // --- Compose --------------------------------------------------------------
  const startCompose = useCallback(() => {
    setDraft({ mode: 'new', to: [], cc: [], bcc: [], subject: '', body: '', threadId: null, inReplyTo: null });
    setComposeOpen(true);
  }, []);

  const startReply = useCallback((message: MessageDto, mode: 'reply' | 'reply_all' | 'forward') => {
    setDraft(buildReplyDraft(user, message, mode));
    setComposeOpen(true);
  }, [user]);

  const handleSendStart = useCallback(
    (outgoing: ComposeDraft): string => {
      const tempId = `temp-${crypto.randomUUID()}`;
      if (detail && outgoing.threadId && detail.thread.id === outgoing.threadId) {
        const temp: MessageDto = {
          id: tempId,
          threadId: outgoing.threadId,
          direction: 'outbound',
          from: user.email,
          to: outgoing.to,
          cc: outgoing.cc,
          bcc: outgoing.bcc,
          subject: outgoing.subject,
          text: outgoing.body,
          html: null,
          messageIdHeader: null,
          inReplyTo: outgoing.inReplyTo ?? null,
          status: 'queued',
          isRead: true,
          createdAt: new Date().toISOString(),
          attachments: [],
          events: [],
        };
        setDetail((previous) => (previous ? { ...previous, messages: [...previous.messages, temp] } : previous));
      }
      return tempId;
    },
    [detail, user.email],
  );

  const handleSendError = useCallback((tempId: string) => {
    setDetail((previous) =>
      previous ? { ...previous, messages: previous.messages.filter((message) => message.id !== tempId) } : previous,
    );
  }, []);

  const handleSent = useCallback(
    async (result: { threadId: string; messageId: string }, tempId?: string) => {
      if (detail && detail.thread.id === result.threadId) {
        await openThread(result.threadId);
      } else {
        if (tempId) handleSendError(tempId);
        await loadThreads({ q: queryRef.current.trim() });
      }
    },
    [detail, openThread, loadThreads, handleSendError],
  );

  // --- Keyboard shortcuts ---------------------------------------------------
  const selectRelative = useCallback(
    (delta: number) => {
      if (threads.length === 0) return;
      const current = threads.findIndex((thread) => thread.id === (focusedId ?? selectedId));
      const next = current === -1 ? 0 : Math.min(threads.length - 1, Math.max(0, current + delta));
      const target = threads[next];
      if (!target) return;
      setFocusedId(target.id);
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-thread-id="${target.id}"]`)?.scrollIntoView({ block: 'nearest' });
      });
    },
    [threads, focusedId, selectedId],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (typing || mod || event.altKey) return;

      const activeId = focusedId ?? selectedId;
      switch (event.key) {
        case 'c':
          if (!event.shiftKey) {
            event.preventDefault();
            startCompose();
          }
          break;
        case 'r': {
          const last = detail ? ([...detail.messages].reverse()[0] as MessageDto | undefined) : undefined;
          if (last) {
            event.preventDefault();
            startReply(last, 'reply');
          }
          break;
        }
        case 'e':
          if (activeId) {
            event.preventDefault();
            const activeThread = threads.find((thread) => thread.id === activeId);
            const toArchive = activeThread?.folder !== 'archive';
            void moveThread(activeId, toArchive ? 'archive' : 'inbox', toArchive ? 'Archived' : 'Moved to inbox');
          }
          break;
        case '#':
          if (activeId) {
            event.preventDefault();
            void moveThread(activeId, 'trash', 'Moved to trash');
          }
          break;
        case 'j':
          event.preventDefault();
          selectRelative(1);
          break;
        case 'k':
          event.preventDefault();
          selectRelative(-1);
          break;
        case 'Enter':
          if (focusedId) {
            event.preventDefault();
            void openThread(focusedId);
          }
          break;
        case '/':
          event.preventDefault();
          searchRef.current?.focus();
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    focusedId,
    selectedId,
    detail,
    startCompose,
    startReply,
    moveThread,
    selectRelative,
    openThread,
  ]);

  const onSignOut = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    window.location.href = '/login';
  }, []);

  const recentForPalette = useMemo(() => threads.slice(0, 12), [threads]);

  const threadList = (
    <ThreadList
      folder={folder}
      threads={threads}
      selectedId={selectedId}
      focusedId={focusedId}
      loading={listLoading}
      loadingMore={loadingMore}
      hasMore={Boolean(nextCursor)}
      query={query}
      onQueryChange={setQuery}
      onSelect={(id) => void openThread(id)}
      onLoadMore={() => void loadThreads({ append: true })}
      onRefresh={() => void loadThreads({ q: queryRef.current.trim() })}
      searchInputRef={searchRef}
    />
  );

  const messageView = (
    <MessageView
      detail={detail}
      loading={detailLoading}
      showBack={isMobile}
      onBack={() => setMobilePane('list')}
      onReply={(message) => startReply(message, 'reply')}
      onReplyAll={(message) => startReply(message, 'reply_all')}
      onForward={(message) => startReply(message, 'forward')}
      onToggleMessageRead={(message) => void toggleMessageRead(message)}
      onToggleThreadRead={() => void toggleThreadRead()}
      onArchive={() =>
        selectedId &&
        void moveThread(selectedId, detail?.thread.folder === 'archive' ? 'inbox' : 'archive',
          detail?.thread.folder === 'archive' ? 'Moved to inbox' : 'Archived')
      }
      onTrash={() => selectedId && void moveThread(selectedId, 'trash', 'Moved to trash')}
      onDeleteForever={() => selectedId && void deleteThreadForever(selectedId)}
    />
  );

  return (
    <TooltipProvider>
      <div className="h-dvh w-full">
      {isMobile ? (
        <div className="flex h-full min-h-0 flex-col">
          <MobileNav
            folder={folder}
            counts={counts}
            user={user}
            theme={theme}
            onToggleTheme={toggleTheme}
            onCompose={startCompose}
            onOpenPalette={() => setPaletteOpen(true)}
          />
          <div className="min-h-0 flex-1">
            {mobilePane === 'thread' && selectedId ? messageView : threadList}
          </div>
        </div>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel defaultSize="17" minSize="13" maxSize="26" id="folders">
            <FolderNav
              folder={folder}
              counts={counts}
              user={user}
              theme={theme}
              onToggleTheme={toggleTheme}
              onCompose={startCompose}
              onOpenPalette={() => setPaletteOpen(true)}
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="31" minSize="22" id="threads">
            {threadList}
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="52" minSize="30" id="message">
            {messageView}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      <ComposeSheet
        open={composeOpen}
        onOpenChange={setComposeOpen}
        draft={draft}
        user={user}
        onSendStart={handleSendStart}
        onSendError={handleSendError}
        onSent={(result, tempId) => void handleSent(result, tempId)}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        folder={folder}
        recentThreads={recentForPalette}
        onSelectThread={(id) => void openThread(id)}
        onCompose={startCompose}
        onToggleTheme={toggleTheme}
        onSignOut={() => void onSignOut()}
      />
      </div>
    </TooltipProvider>
  );
}
