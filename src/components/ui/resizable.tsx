import * as React from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';

import { cn } from '@/lib/utils';

/**
 * shadcn-style wrappers around react-resizable-panels v4 (Group / Panel /
 * Separator). The library manages flex-grow/shrink on the separator, so only
 * visual properties are set here.
 */
function ResizablePanelGroup({ className, ...props }: React.ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn('flex h-full w-full data-[orientation=vertical]:flex-col', className)}
      {...props}
    />
  );
}

function ResizablePanel({ className, ...props }: React.ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" className={cn('overflow-hidden', className)} {...props} />;
}

function ResizableHandle({
  className,
  ...props
}: React.ComponentProps<typeof Separator> & { withHandle?: boolean }) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        'group/resize relative w-px shrink-0 cursor-col-resize bg-border/50 transition-colors hover:bg-primary/40 focus-visible:outline-none data-[resizing]:bg-primary/50',
        // Wider invisible hit area centered on the 1px line.
        'before:absolute before:inset-y-0 before:-left-1 before:w-3 before:content-[""]',
        className,
      )}
      {...props}
    />
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
