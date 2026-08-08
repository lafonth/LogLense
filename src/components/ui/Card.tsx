import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> {
  header?: ReactNode;
  children: ReactNode;
}

export function Card({ header, className = '', children, ...rest }: CardProps) {
  return (
    <section className={`border-border bg-surface rounded-md border ${className}`} {...rest}>
      {header !== undefined && (
        <header className="border-border font-display text-muted tracking-caps border-b px-4 py-3 text-xs uppercase">
          {header}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
