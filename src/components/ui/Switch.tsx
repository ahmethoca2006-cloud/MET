import { cn } from './cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export function Switch({ checked, onChange, disabled, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200',
        'disabled:opacity-40 disabled:pointer-events-none',
        checked ? 'bg-success' : 'bg-ink/15'
      )}
      {...props}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200',
          checked && 'translate-x-5'
        )}
      />
    </button>
  );
}
