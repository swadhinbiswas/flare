import { useRef, useState } from 'react';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiFetch, jsonBody } from '@/lib/client';
import { initials } from '@/lib/format';
import type { SessionUser } from '@/lib/types';

interface ProfileFormProps {
  user: SessionUser;
}

export default function ProfileForm({ user }: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hasAvatar, setHasAvatar] = useState(user.hasAvatar);
  const [version, setVersion] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveName() {
    setSavingName(true);
    try {
      await apiFetch('/api/profile', { method: 'PATCH', ...jsonBody({ displayName }) });
      toast.success('Name saved', { description: 'New messages will use it in the From header.' });
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the name');
    } finally {
      setSavingName(false);
    }
  }

  async function uploadAvatar(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await apiFetch('/api/profile/avatar', { method: 'POST', body: form });
      setHasAvatar(true);
      setVersion(Date.now());
      toast.success('Avatar updated');
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload the avatar');
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      await apiFetch('/api/profile/avatar', { method: 'DELETE' });
      setHasAvatar(false);
      setVersion(Date.now());
      toast.success('Avatar removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the avatar');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-14">
          {hasAvatar ? <AvatarImage src={`/api/profile/avatar?v=${version}`} alt="Profile picture" /> : null}
          <AvatarFallback className="bg-primary/15 text-primary text-base">
            {initials(user.displayName || user.email)}
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
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload picture
          </Button>
          {hasAvatar ? (
            <Button variant="ghost" size="sm" onClick={() => void removeAvatar()} disabled={uploading} className="text-destructive">
              <Trash2 className="size-4" />
              Remove
            </Button>
          ) : null}
          <span className="text-muted-foreground text-xs">PNG, JPEG, WebP or SVG, up to 2MB.</span>
        </div>
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
