import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const FIELD_CLASSES =
  'w-full bg-ink/5 border border-ink/10 rounded-xl px-4 py-2.5 text-ink text-sm outline-none ' +
  'placeholder:text-ink-faint transition-colors duration-150 ' +
  'focus:border-accent focus:bg-surface disabled:opacity-40 disabled:pointer-events-none';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return <input ref={ref} className={cn(FIELD_CLASSES, className)} {...props} />;
});
Input.displayName = 'Input';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return <textarea ref={ref} className={cn(FIELD_CLASSES, 'resize-none', className)} {...props} />;
});
Textarea.displayName = 'Textarea';
