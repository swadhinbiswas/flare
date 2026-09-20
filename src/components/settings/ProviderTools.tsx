import { useCallback, useEffect, useState } from 'react';
import { Ban, Loader2, MailWarning, Plus, RefreshCw, Trash2, Webhook } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch, jsonBody } from '@/lib/client';

interface Suppression {
  id: string;
  email: string;
  reason: string | null;
}

interface WebhookRow {
  id: string;
  endpoint: string;
  events: string[] | null;
}

interface ProviderToolsProps {
  webhookUrl: string;
  providerLabel: string;
}

export default function ProviderTools({ webhookUrl, providerLabel }: ProviderToolsProps) {
  const [suppressions, setSuppressions] = useState<Suppression[] | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookRow[] | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [suppressionResult, webhookResult] = await Promise.allSettled([
      apiFetch<{ suppressions: Suppression[] }>('/api/provider/suppressions'),
      apiFetch<{ webhooks: WebhookRow[] }>('/api/provider/webhooks'),
    ]);
    if (suppressionResult.status === 'fulfilled') setSuppressions(suppressionResult.value.suppressions);
    else setSuppressions([]);
    if (webhookResult.status === 'fulfilled') setWebhooks(webhookResult.value.webhooks);
    else setWebhooks([]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSuppression() {
    if (!newEmail.includes('@')) {
      toast.error('Enter a valid email address');
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/provider/suppressions', { method: 'POST', ...jsonBody({ email: newEmail.trim() }) });
      setNewEmail('');
      toast.success('Address suppressed');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the suppression');
    } finally {
      setBusy(false);
    }
  }

  async function removeSuppression(entry: Suppression) {
    setBusy(true);
    try {
      await apiFetch('/api/provider/suppressions', { method: 'DELETE', ...jsonBody({ id: entry.id, email: entry.email }) });
      toast.success('Suppression removed');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the suppression');
    } finally {
      setBusy(false);
    }
  }

  async function createWebhook() {
    setBusy(true);
    try {
      const result = await apiFetch<{ signingSecret?: string }>('/api/provider/webhooks', {
        method: 'POST',
        ...jsonBody({ endpoint: webhookUrl }),
      });
      if (result.signingSecret) setSecret(result.signingSecret);
      toast.success('Webhook registered', { description: 'Copy the signing secret into your secrets store.' });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not register the webhook');
    } finally {
      setBusy(false);
    }
  }

  async function deleteWebhook(row: WebhookRow) {
    setBusy(true);
    try {
      await apiFetch('/api/provider/webhooks', { method: 'DELETE', ...jsonBody({ id: row.id }) });
      toast.success('Webhook removed');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the webhook');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 text-sm">
      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-medium">
            <Webhook className="size-4" /> Webhooks
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
            <Button size="sm" onClick={() => void createWebhook()} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Register this app
            </Button>
          </div>
        </div>
        {webhooks === null ? (
          <p className="text-muted-foreground text-xs">Loading…</p>
        ) : webhooks.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No webhooks registered with {providerLabel}. Register one pointing at{' '}
            <code className="text-xs">{webhookUrl}</code>.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {webhooks.map((row) => (
              <li key={row.id} className="bg-muted/40 flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-xs">{row.endpoint}</span>
                  <span className="text-muted-foreground block truncate text-[10px]">
                    {row.events ? `${row.events.length} events` : 'all events'}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive"
                  onClick={() => void deleteWebhook(row)}
                  disabled={busy}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {secret ? (
          <div className="mt-3 rounded-md border border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--warning)_10%,transparent)] p-2.5">
            <p className="text-xs font-medium">Signing secret</p>
            <p className="text-muted-foreground mt-1 text-[11px]">
              Store this as a secret for this account, then restart or redeploy.
            </p>
            <code className="mt-1 block overflow-x-auto text-[11px]">{secret}</code>
          </div>
        ) : null}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-medium">
            <MailWarning className="size-4" /> Suppressions
          </h3>
        </div>
        <div className="mb-3 flex gap-2">
          <Input
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            placeholder="address@example.com"
            inputMode="email"
            className="h-8 text-sm"
          />
          <Button variant="secondary" size="sm" onClick={() => void addSuppression()} disabled={busy}>
            <Ban className="size-3.5" /> Suppress
          </Button>
        </div>
        {suppressions === null ? (
          <p className="text-muted-foreground text-xs">Loading…</p>
        ) : suppressions.length === 0 ? (
          <p className="text-muted-foreground text-xs">Nothing suppressed. Bounces land here automatically.</p>
        ) : (
          <ul className="space-y-1.5">
            {suppressions.map((entry) => (
              <li
                key={`${entry.id}-${entry.email}`}
                className="bg-muted/40 flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs">{entry.email}</span>
                  {entry.reason ? (
                    <span className="text-muted-foreground block truncate text-[10px]">{entry.reason}</span>
                  ) : null}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void removeSuppression(entry)}
                  disabled={busy}
                  className="text-muted-foreground"
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
