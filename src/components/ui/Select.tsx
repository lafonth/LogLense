import type { ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

export function Select({ label, className = '', children, ...rest }: SelectProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-2xs text-muted font-sans tracking-[0.1em] uppercase">
        {label}
      </label>
      <select
        id={id}
        className={`border-border bg-surface text-text focus-visible:outline-brass-bright cursor-pointer rounded-sm border px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-1 ${className}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}
