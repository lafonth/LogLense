import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className = '', ...rest }: InputProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-2xs text-muted font-sans tracking-[0.1em] uppercase">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`bg-surface text-text placeholder:text-dim focus-visible:outline-brass-bright rounded-sm border px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-1 ${error ? 'border-danger' : 'border-border'} ${className}`}
        {...rest}
      />
      {error && (
        <p id={errorId} className="text-2xs text-danger font-sans">
          {error}
        </p>
      )}
    </div>
  );
}
