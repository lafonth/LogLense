import type { ReactNode } from 'react';

interface ScrollAreaProps {
  className?: string;
  children: ReactNode;
}

/** Confines wide content to its own scroller so it can never widen the page. */
export function ScrollArea({ className = '', children }: ScrollAreaProps) {
  return <div className={`w-full max-w-full overflow-x-auto ${className}`}>{children}</div>;
}
