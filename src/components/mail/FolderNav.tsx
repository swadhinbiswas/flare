import { useState } from 'react';
import {
  Archive,
  Inbox,
  LogOut,
  Mail,
  Moon,
  PenLine,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sun,
  Trash2,
  Command as CommandIcon,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiFetch } from '@/lib/client';
import { initials } from '@/lib/format';
import { THEMES, type ThemeId } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { Folder, SessionUser } from '@/lib/types';
import type { FolderCounts } from '@/lib/threads';

interface FolderNavProps {
  folder: Folder;
  counts: FolderCounts;
  user: SessionUser;
  theme: 'light' | 'dark';
  themeId: ThemeId;
  syncing: boolean;
  onToggleTheme: () => void;
  onThemeChange: (id: ThemeId) => void;
  onCompose: () => void;
  onOpenPalette: () => void;
  onSync: () => void;
}

const NAV_ITEMS: { folder: Folder; label: string; href: string; icon: typeof Inbox }[] = [
  { folder: 'inbox', label: 'Inbox', href: '/', icon: Inbox },
  { folder: 'sent', label: 'Sent', href: '/sent', icon: Send },
  { folder: 'archive', label: 'Archive', href: '/archive', icon: Archive },
  { folder: 'trash', label: 'Trash', href: '/trash', icon: Trash2 },
];

export default function FolderNav({
  folder,
  counts,
  user,
  theme,
  themeId,
  syncing,
  onToggleTheme,
  onThemeChange,
  onCompose,
  onOpenPalette,
  onSync,
}: FolderNavProps) {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Fall through to the redirect; the session may already be gone.
    }
    window.location.href = '/login';
  }

  return (
    <nav className="bg-card/40 flex h-full min-w-0 flex-col border-r">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg">
          <Mail className="size-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">RFLARE</span>
      </div>

      <div className="px-3 pb-3">
        <Button className="w-full justify-start gap-2" onClick={onCompose}>
          <PenLine className="size-4" />
          Compose
          <kbd className="bg-primary-foreground/15 ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium">c</kbd>
        </Button>
      </div>

      <ul className="flex flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = item.folder === folder;
          const badge =
            item.folder === 'inbox'
              ? counts.inboxUnread
              : item.folder === 'sent'
                ? 0
                : counts.counts[item.folder];
          return (
            <li key={item.folder}>
              <a
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <item.icon className="size-4" />
                {item.label}
                {badge > 0 ? (
                  <span
                    className={cn(
                      'ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                      item.folder === 'inbox' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {badge}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto p-3">
        <Button variant="ghost" size="sm" className="text-muted-foreground w-full justify-start gap-2" onClick={onOpenPalette}>
          <Search className="size-4" />
          Search & commands
          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px]">
            <CommandIcon className="size-3" />K
          </span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground w-full justify-start gap-2"
          onClick={onSync}
          disabled={syncing}
        >
          <RefreshCw className={cn('size-4', syncing && 'animate-spin')} />
          {syncing ? 'Syncing with Resend…' : 'Sync from Resend'}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="hover:bg-accent/60 mt-1 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors"
            >
              <Avatar className="size-7">
                {user.hasAvatar ? <AvatarImage src="/api/profile/avatar" alt="" /> : null}
                <AvatarFallback className="bg-primary/15 text-primary text-[10px]">
                  {initials(user.displayName || user.email)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {user.displayName || user.email.split('@')[0]}
                </span>
                <span className="text-muted-foreground block truncate text-[10px]">{user.email}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-60">
            <DropdownMenuLabel>Signed in as {user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onToggleTheme}>
              {theme === 'dark' ? <Sun /> : <Moon />}
              Switch to {theme === 'dark' ? 'light' : 'dark'} mode
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenPalette}>
              <CommandIcon /> Command palette
              <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={themeId}
              onValueChange={(value) => onThemeChange(value as ThemeId)}
            >
              {THEMES.map((option) => (
                <DropdownMenuRadioItem key={option.id} value={option.id}>
                  <span className="flex flex-col">
                    {option.label}
                    <span className="text-muted-foreground text-[10px]">{option.hint}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                window.location.href = '/settings';
              }}
            >
              <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={signingOut} onClick={signOut}>
              <LogOut /> {signingOut ? 'Signing out…' : 'Sign out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
