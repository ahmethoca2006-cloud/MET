import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/** A shimmering liquid-glass placeholder block — matches GlassCard's rounding/border so a
 *  loading section reads as "the same card, not yet filled" rather than a generic gray box. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-skeleton rounded-lg border border-hairline/60', className)}
      aria-hidden="true"
      {...props}
    />
  );
}

/** A GlassCard-shaped skeleton, for whole-card loading states (list/grid items, panels). */
export function SkeletonCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('liquid-glass rounded-2xl overflow-hidden', className)}
      aria-hidden="true"
      {...props}
    >
      <div className="animate-skeleton w-full h-full" />
    </div>
  );
}

/** A single shimmering list row (avatar/icon + two text bars) — for chat lists, leaderboards,
 *  member/invite lists, and any other row-per-item section waiting on data. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 p-3', className)} aria-hidden="true">
      <Skeleton className="w-9 h-9 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5 min-w-0">
        <Skeleton className="h-3" style={{ width: '55%' }} />
        <Skeleton className="h-2.5" style={{ width: '32%' }} />
      </div>
    </div>
  );
}

/** A few lines of shimmering text-width bars, for list rows / detail panels waiting on data. */
export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}
