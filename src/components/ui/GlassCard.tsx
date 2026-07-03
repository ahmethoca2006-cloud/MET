import type { HTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'regular' | 'heavy' | 'nav';
type Radius = 'xl' | '2xl' | 'full';

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  radius?: Radius;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  regular: 'liquid-glass',
  heavy: 'liquid-glass-heavy',
  nav: 'liquid-glass-nav',
};

const RADIUS_CLASSES: Record<Radius, string> = {
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
};

export function GlassCard({ variant = 'regular', radius = '2xl', className, children, ...props }: GlassCardProps) {
  return (
    <div className={cn(VARIANT_CLASSES[variant], RADIUS_CLASSES[radius], className)} {...props}>
      {children}
    </div>
  );
}
