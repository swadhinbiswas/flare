import { useRef, useState } from 'react';
import { Link2, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiFetch, jsonBody } from '@/lib/client';
import { avatarSrc } from '@/lib/avatar';
import { initials } from '@/lib/format';
import type { SessionUser } from '@/lib/types';

interface ProfileFormProps {
  user: SessionUser;
}

export default function ProfileForm({ user }: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? '');
  const [savingName, setSavingName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasUpload, setHasUpload] = useState(user.hasAvatar);
  const [version, setVersion] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = avatarUrl.trim() || avatarSrc({ avatarUrl: null, hasAvatar: hasUpload }, version) || '';
  const hasPicture = Boolean(preview);

  function reloadSoon() {
    setTimeout(() => window.location.reload(), 600);
  }

  async function saveName() {
    setSavingName(true);
    try {
      await apiFetch('/api/profile', { method: 'PATCH', ...jsonBody({ displayName }) });
      toast.success('Name saved', { description: 'New messages will use it in the From header.' });
      reloadSoon();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the name');
    } finally {
      setSavingName(false);
    }
  }

  async function saveUrl() {
    setBusy(true);
    try {
      await apiFetch('/api/profile', { method: 'PATCH', ...jsonBody({ avatarUrl: avatarUrl.trim() || null }) });
      setHasUpload(false);
      toast.success(avatarUrl.trim() ? 'Profile picture set from URL' : 'Profile picture cleared');
      reloadSoon();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the URL');
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await apiFetch('/api/profile/avatar', { method: 'POST', body: form });
      setHasUpload(true);
      setAvatarUrl('');
      setVersion(Date.now());
      toast.success('Profile picture uploaded');
      reloadSoon();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload the picture');
    } finally {
      setBusy(false);
    }
  }

  async function removePicture() {
    setBusy(true);
    try {
      await apiFetch('/api/profile/avatar', { method: 'DELETE' });
      setHasUpload(false);
      setAvatarUrl('');
      setVersion(Date.now());
      toast.success('Profile picture removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the picture');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="size-14">
          {hasPicture ? <AvatarImage src={preview} alt="Profile picture" /> : null}
          <AvatarFallback className="bg-primary/15 text-primary text-base">
            {initials(displayName || user.email)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadAvatar(file);
              event.target.value = '';
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload
          </Button>
          {hasPicture ? (
            <Button variant="ghost" size="sm" onClick={() => void removePicture()} disabled={busy} className="text-destructive">
              <Trash2 className="size-4" />
              Remove
            </Button>
          ) : null}
          <span className="text-muted-foreground text-xs">PNG, JPEG, WebP or SVG, up to 2MB.</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="avatar-url">Profile picture URL</Label>
        <div className="flex gap-2">
          <Input
            id="avatar-url"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://example.com/avatar.png"
            inputMode="url"
          />
          <Button variant="secondary" onClick={() => void saveUrl()} disabled={busy}>
            <Link2 className="size-4" />
            Use URL
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Paste a direct image link to skip uploading. An upload replaces the URL.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="display-name">Display name</Label>
        <div className="flex gap-2">
          <Input
            id="display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your name"
            maxLength={120}
          />
          <Button onClick={() => void saveName()} disabled={savingName}>
            {savingName ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Outgoing mail is sent as <span className="text-foreground">{displayName || user.email}</span>
          {displayName ? ` <${user.email}>` : ''}.
        </p>
      </div>
    </div>
  );
}
