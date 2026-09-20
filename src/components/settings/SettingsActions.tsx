import { useState } from 'react';
import { LogOut, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/client';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/types';

interface SettingsActionsProps {
  user: SessionUser;
  webhookUrl: string;
}

export default function SettingsActions({ user, webhookUrl }: SettingsActionsProps) {
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('rflare-theme', next);
    } catch {
      // ignore
    }
    setTheme(next);
  }

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    window.location.href = '/login';
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={toggleTheme} className="gap-2">
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </Button>
      <Button variant="outline" size="sm" onClick={copyWebhook} className={cn('gap-2', copied && 'text-[var(--success)]')}>
        {copied ? 'Copied!' : 'Copy webhook URL'}
      </Button>
      <span className="text-muted-foreground hidden text-xs sm:inline">{user.email}</span>
      <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut} className="text-destructive gap-2">
        <LogOut className="size-4" />
        {signingOut ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  );
}
