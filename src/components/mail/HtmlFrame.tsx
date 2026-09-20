import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface HtmlFrameProps {
  html: string;
  className?: string;
}

function buildSrcDoc(html: string, dark: boolean): string {
  const fg = dark ? '#e7e7ea' : '#18181b';
  const border = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';
  const link = dark ? '#7ea2ff' : '#3b5bdb';
  return `<!doctype html><html><head><meta charset="utf-8" />
<base target="_blank" />
<style>
  :root { color-scheme: ${dark ? 'dark' : 'light'}; }
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px; line-height: 1.6; color: ${fg}; overflow-wrap: anywhere;
  }
  img, video { max-width: 100%; height: auto; }
  a { color: ${link}; text-decoration: underline; text-underline-offset: 2px; }
  blockquote { border-left: 2px solid ${border}; margin-left: 0; padding-left: 12px; opacity: 0.85; }
  table { max-width: 100%; }
  pre { overflow-x: auto; padding: 10px; border-radius: 6px; background: ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}; }
  hr { border: none; border-top: 1px solid ${border}; }
</style></head><body>${html}</body></html>`;
}

/**
 * Renders untrusted email HTML inside a sandboxed iframe. `allow-same-origin`
 * is needed to measure the content height, but scripts are NOT allowed (no
 * allow-scripts), so message HTML can never execute JavaScript in the app.
 */
export default function HtmlFrame({ html, className }: HtmlFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const srcDoc = buildSrcDoc(html, dark);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const doc = frame.contentDocument;
      if (!doc) return;
      const next = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0) + 4;
      setHeight((current) => (Math.abs(current - next) > 2 ? next : current));
    };
    const onLoad = () => {
      measure();
      setTimeout(measure, 120);
      setTimeout(measure, 500);
    };
    frame.addEventListener('load', onLoad);
    onLoad();
    return () => {
      cancelled = true;
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
