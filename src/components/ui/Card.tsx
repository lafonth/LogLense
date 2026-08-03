import type { ReactNode } from 'react';

interface CardProps {
  header?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ header, className = '', children }: CardProps) {
  return (
    <section className={`border-border bg-surface rounded-md border ${className}`}>
      {header !== undefined && (
        <header className="border-border font-display text-muted border-b px-4 py-3 text-xs tracking-[0.14em] uppercase">
          {header}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
