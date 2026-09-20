import { useCallback, useEffect, useState } from 'react';
import { Archive, Inbox, LogOut, Mail, Moon, Palette, PenLine, RefreshCw, Send, Settings, Sun, Trash2 } from 'lucide-react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { apiFetch } from '@/lib/client';
import { relativeTime } from '@/lib/format';
import { emailOf, nameOf } from '@/lib/mail-utils';
import { THEMES, type ThemeId } from '@/lib/theme';
import type { Folder, ThreadListResponse, ThreadSummaryDto } from '@/lib/types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: Folder;
  recentThreads: ThreadSummaryDto[];
  syncing: boolean;
  themeId: ThemeId;
  onSelectThread: (id: string) => void;
  onCompose: () => void;
  onToggleTheme: () => void;
  onThemeChange: (id: ThemeId) => void;
  onSync: () => void;
  onSignOut: () => void;
}

export default function CommandPalette({
  open,
  onOpenChange,
  recentThreads,
  syncing,
  themeId,
  onSelectThread,
  onCompose,
  onToggleTheme,
  onThemeChange,
  onSync,
  onSignOut,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ThreadSummaryDto[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(null);
    }
  }, [open]);

  const runSearch = useCallback(async (value: string) => {
    setSearching(true);
    try {
      const params = new URLSearchParams({ folder: 'all', q: value });
      const data = await apiFetch<ThreadListResponse>(`/api/threads?${params}`);
      setResults(data.threads);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => void runSearch(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  function go(href: string) {
    onOpenChange(false);
    window.location.href = href;
  }

  const threads = results ?? recentThreads;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search and commands">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search mail or run a command…"
        aria-label="Search mail or run a command"
      />
      <CommandList>
        <CommandEmpty>{searching ? 'Searching…' : 'No results found.'}</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            value="compose new message"
            onSelect={() => {
              onOpenChange(false);
              onCompose();
            }}
          >
            <PenLine /> New message
            <CommandShortcut>c</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="sync from resend import recent mail"
            onSelect={() => {
              onOpenChange(false);
              onSync();
            }}
          >
            <RefreshCw className={syncing ? 'animate-spin' : undefined} />
            {syncing ? 'Syncing with Resend…' : 'Sync from Resend'}
          </CommandItem>
          <CommandItem value="go to inbox" onSelect={() => go('/')}>
            <Inbox /> Inbox
          </CommandItem>
          <CommandItem value="go to sent" onSelect={() => go('/sent')}>
            <Send /> Sent
          </CommandItem>
          <CommandItem value="go to archive" onSelect={() => go('/archive')}>
            <Archive /> Archive
          </CommandItem>
          <CommandItem value="go to trash" onSelect={() => go('/trash')}>
            <Trash2 /> Trash
          </CommandItem>
          <CommandItem value="open settings" onSelect={() => go('/settings')}>
            <Settings /> Settings
          </CommandItem>
          <CommandItem
            value="toggle theme dark light"
            onSelect={() => {
              onToggleTheme();
              onOpenChange(false);
            }}
          >
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" /> Toggle theme
          </CommandItem>
          <CommandItem
            value="sign out log out"
            onSelect={() => {
              onOpenChange(false);
              onSignOut();
            }}
          >
            <LogOut /> Sign out
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Theme">
          {THEMES.map((option) => (
            <CommandItem
              key={option.id}
              value={`theme palette ${option.label} ${option.id}`}
              onSelect={() => {
                onThemeChange(option.id);
                onOpenChange(false);
              }}
            >
              <Palette />
              {option.label}
              {option.id === themeId ? <CommandShortcut>active</CommandShortcut> : null}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading={results ? `Results for “${query}”` : 'Recent conversations'}>
          {threads.slice(0, 12).map((thread) => (
            <CommandItem
              key={thread.id}
              value={`${thread.id} ${thread.subject} ${thread.participants.map(emailOf).join(' ')}`}
              onSelect={() => {
                onOpenChange(false);
                onSelectThread(thread.id);
              }}
            >
              <Mail className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {thread.subject || '(no subject)'}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {thread.participants.map((address) => nameOf(address)).join(', ')} · {relativeTime(thread.lastMessageAt)}
                </span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
