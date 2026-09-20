import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface HtmlFrameProps {
  html: string;
  className?: string;
}

interface FrameTokens {
  foreground: string;
  link: string;
  border: string;
  muted: string;
  dark: boolean;
}

const FALLBACK: FrameTokens = {
  foreground: '#18181b',
  link: '#4f46e5',
  border: 'rgba(0,0,0,0.1)',
  muted: 'rgba(0,0,0,0.05)',
  dark: false,
};

function readTokens(): FrameTokens {
  if (typeof document === 'undefined') return FALLBACK;
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    foreground: read('--foreground', FALLBACK.foreground),
    link: read('--primary', FALLBACK.link),
    border: read('--border', FALLBACK.border),
    muted: read('--muted', FALLBACK.muted),
    dark: root.classList.contains('dark'),
  };
}

function buildSrcDoc(html: string, tokens: FrameTokens): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
<base target="_blank" />
<style>
  :root { color-scheme: ${tokens.dark ? 'dark' : 'light'}; }
  html, body { margin: 0; padding: 0; background: transparent; }
  /* flow-root keeps child margins inside the body, so scrollHeight is the real
     content height and nothing gets clipped at the bottom. */
  body {
    display: flow-root;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px; line-height: 1.6; color: ${tokens.foreground}; overflow-wrap: anywhere;
  }
  img, video { max-width: 100%; height: auto; }
  a { color: ${tokens.link}; text-decoration: underline; text-underline-offset: 2px; }
  blockquote { border-left: 2px solid ${tokens.border}; margin-left: 0; padding-left: 12px; opacity: 0.85; }
  table { max-width: 100%; }
  pre { overflow-x: auto; padding: 10px; border-radius: 6px; background: ${tokens.muted}; }
  hr { border: none; border-top: 1px solid ${tokens.border}; }
</style></head><body>${html}</body></html>`;
}

/**
 * Renders untrusted email HTML inside a sandboxed iframe. `allow-same-origin`
 * is needed to measure the content height, but scripts are NOT allowed (no
 * allow-scripts), so message HTML can never execute JavaScript in the app.
 *
 * Colors come from the active palette's CSS variables, so mail stays readable
 * in every theme and in both light and dark mode.
 */
export default function HtmlFrame({ html, className }: HtmlFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);
  const [tokens, setTokens] = useState<FrameTokens>(FALLBACK);

  useEffect(() => {
    const update = () => setTokens(readTokens());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, []);

  const srcDoc = buildSrcDoc(html, tokens);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;

    // documentElement.scrollHeight reports the viewport height, so it can only
    // grow. The body's scrollHeight is the real content height.
    const measure = () => {
      if (cancelled) return;
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      const next = Math.ceil(Math.max(doc.body.scrollHeight, 24)) + 4;
      setHeight((current) => (Math.abs(current - next) > 2 ? next : current));
    };

    const onLoad = () => {
      measure();
      observer?.disconnect();
      const doc = frame.contentDocument;
      if (doc?.body && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => measure());
        observer.observe(doc.body);
      }
      setTimeout(measure, 150);
      setTimeout(measure, 600);
    };

    frame.addEventListener('load', onLoad);
    onLoad();
    return () => {
      cancelled = true;
      observer?.disconnect();
      frame.removeEventListener('load', onLoad);
    };
  }, [srcDoc]);

  return (
    <iframe
      ref={frameRef}
      title="Message content"
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className={cn('w-full border-0 bg-transparent', className)}
      style={{ height }}
    />
  );
}
