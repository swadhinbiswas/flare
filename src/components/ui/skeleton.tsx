import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'bg-muted relative overflow-hidden rounded-md',
        'after:absolute after:inset-0 after:animate-shimmer after:bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--foreground)_6%,transparent),transparent)] after:bg-[length:200%_100%]',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
