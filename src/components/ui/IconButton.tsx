import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Size = 'sm' | 'md' | 'lg';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  active?: boolean;
  'aria-label': string;
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'w-8 h-8',
  md: 'w-9 h-9 sm:w-10 sm:h-10',
  lg: 'w-11 h-11 sm:w-12 sm:h-12',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', active = false, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl border transition-colors duration-150 shrink-0',
          'disabled:opacity-40 disabled:pointer-events-none',
          active
            ? 'bg-accent-soft border-accent/30 text-accent'
            : 'bg-ink/5 border-ink/10 text-ink hover:bg-ink/10',
          SIZE_CLASSES[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
IconButton.displayName = 'IconButton';
