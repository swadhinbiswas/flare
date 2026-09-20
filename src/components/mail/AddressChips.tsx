import { useState } from 'react';
import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { isValidEmail } from '@/lib/mail-utils';
import { cn } from '@/lib/utils';

interface AddressChipsProps {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/** Chip input for To/Cc/Bcc fields: Enter, comma or Tab commits a chip. */
export default function AddressChips({
  label,
  value,
  onChange,
  placeholder,
  autoFocus = false,
}: AddressChipsProps) {
  const [input, setInput] = useState('');

  function commit(raw: string) {
    const candidates = raw
      .split(/[,;]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (candidates.length === 0) return;
    const next = [...value];
    for (const candidate of candidates) {
      if (!next.some((existing) => existing.toLowerCase() === candidate.toLowerCase())) next.push(candidate);
    }
    onChange(next);
    setInput('');
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5 shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50">
      <span className="text-muted-foreground pl-1 text-xs font-medium">{label}</span>
      {value.map((address) => {
        const valid = isValidEmail(address);
        return (
          <Badge
            key={address}
            variant={valid ? 'secondary' : 'destructive'}
            className="gap-1 py-0.5 pr-1 pl-2 text-xs font-normal"
          >
            {address}
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item !== address))}
              className="hover:bg-background/40 rounded-full p-0.5"
              aria-label={`Remove ${address}`}
            >
              <X className="size-3" />
            </button>
          </Badge>
        );
      })}
      <input
        value={input}
        autoFocus={autoFocus}
        onChange={(event) => {
          const next = event.target.value;
          if (next.includes(',')) commit(next);
          else setInput(next);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'Tab' || event.key === ',') {
            if (input.trim()) {
              event.preventDefault();
              commit(input);
            }
          } else if (event.key === 'Backspace' && !input && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(input)}
        onPaste={(event) => {
          const text = event.clipboardData.getData('text');
          if (text.includes(',') || text.includes(';')) {
            event.preventDefault();
            commit(text);
          }
        }}
        placeholder={value.length === 0 ? placeholder : undefined}
        className={cn('min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none')}
        inputMode="email"
        aria-label={label}
      />
    </div>
  );
}
