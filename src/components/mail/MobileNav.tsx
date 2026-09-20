import { useState } from 'react';
import { Archive, Check, Inbox, LogOut, Mail, Menu, Moon, PenLine, RefreshCw, Search, Send, Settings, Sun, Trash2 } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { apiFetch } from '@/lib/client';
import { initials } from '@/lib/format';
import { THEMES, type ThemeId } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { Folder, SessionUser } from '@/lib/types';
import type { FolderCounts } from '@/lib/threads';

interface MobileNavProps {
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

const TITLES: Record<Folder, string> = { inbox: 'Inbox', sent: 'Sent', archive: 'Archive', trash: 'Trash' };

export default function MobileNav({
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
}: MobileNavProps) {
  const [open, setOpen] = useState(false);

  async function signOut() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    window.location.href = '/login';
  }

  return (
    <header className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20 flex items-center gap-1 border-b px-2 py-2 backdrop-blur">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <Menu className="size-4" />
            <span className="sr-only">Open navigation</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="px-4 pt-5 pb-3">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md">
                <Mail className="size-3.5" />
              </span>
              RFLARE
            </SheetTitle>
          </SheetHeader>
          <div className="px-3 pb-2">
            <Button
              className="w-full justify-start gap-2"
              onClick={() => {
                setOpen(false);
                onCompose();
              }}
            >
              <PenLine className="size-4" /> Compose
            </Button>
          </div>
          <ul className="flex flex-col gap-0.5 px-3 py-1">
            {NAV_ITEMS.map((item) => {
              const active = item.folder === folder;
              const badge = item.folder === 'inbox' ? counts.inboxUnread : counts.counts[item.folder];
              return (
                <li key={item.folder}>
                  <a
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
                      active ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground',
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                    {badge > 0 ? (
                      <span className="bg-muted text-muted-foreground ml-auto rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
                        {badge}
                      </span>
                    ) : null}
                  </a>
                </li>
              );
            })}
          </ul>
          <div className="px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => {
                setOpen(false);
                onOpenPalette();
              }}
            >
              <Search className="size-4" /> Search & commands
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              disabled={syncing}
              onClick={() => {
                setOpen(false);
                onSync();
              }}
            >
              <RefreshCw className={cn('size-4', syncing && 'animate-spin')} />
              {syncing ? 'Syncing with Resend…' : 'Sync from Resend'}
            </Button>
          </div>
          <Separator className="my-2" />
          <div className="mt-auto px-3 pb-5">
            <div className="flex items-center gap-2.5 px-1 py-2">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/15 text-primary text-[10px]">
                  {initials(user.email)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{user.email.split('@')[0]}</span>
                <span className="text-muted-foreground block truncate text-[10px]">{user.email}</span>
              </span>
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={onToggleTheme}>
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </Button>
            <p className="text-muted-foreground px-1 pt-3 pb-1.5 text-[11px] font-medium tracking-wide uppercase">
              Theme
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {THEMES.map((option) => {
                const active = option.id === themeId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onThemeChange(option.id)}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                      active
                        ? 'border-primary/50 bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent/50',
                    )}
                  >
                    {option.label}
                    {active ? <Check className="text-primary size-3.5" /> : null}
                  </button>
                );
              })}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => {
                setOpen(false);
                window.location.href = '/settings';
              }}
            >
              <Settings className="size-4" /> Settings
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive w-full justify-start gap-2" onClick={signOut}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <span className="text-sm font-semibold tracking-tight">{TITLES[folder]}</span>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onOpenPalette}>
          <Search className="size-4" />
          <span className="sr-only">Search</span>
        </Button>
        <Button size="icon-sm" onClick={onCompose}>
          <PenLine className="size-4" />
          <span className="sr-only">Compose</span>
        </Button>
      </div>
    </header>
  );
}
