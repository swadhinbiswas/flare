import { useState } from 'react';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, jsonBody } from '@/lib/client';
import { cn } from '@/lib/utils';
import type { AccountSummary } from '@/lib/accounts';

interface AccountsManagerProps {
  accounts: AccountSummary[];
  activeId: string;
}

const PROVIDERS = [
  { id: 'resend', label: 'Resend' },
  { id: 'maileroo', label: 'Maileroo' },
  { id: 'smtp', label: 'SMTP' },
];

export default function AccountsManager({ accounts, activeId }: AccountsManagerProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState('resend');
  const [form, setForm] = useState<Record<string, string>>({ secure: 'tls', port: '465' });

  function set(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function create() {
    setBusy(true);
    try {
      const secrets: Record<string, string> = {};
      const config: Record<string, string> = {};
      if (provider === 'smtp') {
        config.host = form.host ?? '';
        config.port = form.port ?? '465';
        config.secure = form.secure ?? 'tls';
        if (form.username) secrets.username = form.username;
        secrets.password = form.password ?? '';
      } else {
        secrets.apiKey = form.apiKey ?? '';
        if (form.webhookSecret) secrets.webhookSecret = form.webhookSecret;
      }
      await apiFetch('/api/accounts', {
        method: 'PUT',
        ...jsonBody({
          provider,
          label: form.label ?? '',
          fromEmail: form.fromEmail ?? '',
          fromName: form.fromName ?? null,
          inboundDomain: provider === 'smtp' ? null : (form.inboundDomain ?? null),
          secrets,
          config,
        }),
      });
      toast.success('Account added', { description: 'It is now the active account.' });
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the account');
    } finally {
      setBusy(false);
    }
  }

  async function remove(account: AccountSummary) {
    setBusy(true);
    try {
      await apiFetch('/api/accounts', { method: 'DELETE', ...jsonBody({ id: account.id }) });
      toast.success('Account removed');
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <ul className="space-y-2">
        {accounts.map((account) => (
          <li key={account.id} className="bg-muted/40 flex items-center justify-between gap-3 rounded-md px-3 py-2">
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-medium">
                {account.label}
                {account.id === activeId ? <Check className="text-primary size-3.5" /> : null}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {account.provider}
                {account.fromEmail ? ` · from ${account.fromEmail}` : ''}
                {account.inboundDomain ? ` · ${account.inboundDomain}` : ''}
                {account.source === 'env' ? ' · from environment' : ''}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px]',
                  account.configured ? 'text-[var(--success)]' : 'text-[var(--warning)]',
                )}
              >
                {account.configured ? 'configured' : 'needs credentials'}
              </span>
              {account.source === 'database' ? (
                <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => void remove(account)} disabled={busy}>
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {open ? (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex flex-wrap gap-1.5">
            {PROVIDERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setProvider(option.id)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs transition-colors',
                  provider === option.id ? 'border-primary/50 bg-primary/10' : 'border-border text-muted-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="account-label">Label</Label>
              <Input id="account-label" value={form.label ?? ''} onChange={(event) => set('label', event.target.value)} placeholder="Work" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-from">From address</Label>
              <Input id="account-from" value={form.fromEmail ?? ''} onChange={(event) => set('fromEmail', event.target.value)} placeholder="me@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-name">From name</Label>
              <Input id="account-name" value={form.fromName ?? ''} onChange={(event) => set('fromName', event.target.value)} placeholder="Your Name" />
            </div>
            {provider !== 'smtp' ? (
              <div className="space-y-1.5">
                <Label htmlFor="account-domain">Inbound domain</Label>
                <Input id="account-domain" value={form.inboundDomain ?? ''} onChange={(event) => set('inboundDomain', event.target.value)} placeholder="example.com" />
              </div>
            ) : null}
          </div>

          {provider === 'smtp' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-host">Host</Label>
                <Input id="smtp-host" value={form.host ?? ''} onChange={(event) => set('host', event.target.value)} placeholder="smtp.example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-port">Port</Label>
                <Input id="smtp-port" value={form.port ?? ''} onChange={(event) => set('port', event.target.value)} placeholder="465" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-secure">TLS</Label>
                <select
                  id="smtp-secure"
                  value={form.secure ?? 'tls'}
                  onChange={(event) => set('secure', event.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="tls">Implicit TLS (465)</option>
                  <option value="starttls">STARTTLS (587)</option>
                  <option value="none">None (local relay)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-user">Username</Label>
                <Input id="smtp-user" value={form.username ?? ''} onChange={(event) => set('username', event.target.value)} placeholder="optional" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-pass">Password</Label>
                <Input id="smtp-pass" type="password" value={form.password ?? ''} onChange={(event) => set('password', event.target.value)} />
              </div>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="account-key">API key</Label>
                <Input id="account-key" type="password" value={form.apiKey ?? ''} onChange={(event) => set('apiKey', event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account-secret">Webhook signing secret</Label>
                <Input id="account-secret" type="password" value={form.webhookSecret ?? ''} onChange={(event) => set('webhookSecret', event.target.value)} placeholder="optional until the webhook exists" />
              </div>
            </div>
          )}

          <p className="text-muted-foreground text-xs">
            Secrets are encrypted with AES-GCM before they reach the database. SMTP accounts can send
            but not receive; inbound mail always arrives through the account whose MX record is set.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void create()} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Add account
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Add account
        </Button>
      )}
    </div>
  );
}
