'use client';

import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { Button } from './Button';

interface SheetProps {
  /** What the trigger shows on mobile — usually the current selection. */
  triggerLabel: string;
  title: string;
  children: ReactNode;
}

export function Sheet({ triggerLabel, title, children }: SheetProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <>
      {/* Mobile: a trigger, then a panel. Hidden from md up. */}
      <div className="md:hidden">
        <Button variant="secondary" size="sm" className="w-full" onClick={() => setOpen(true)}>
          {triggerLabel}
        </Button>
        {open && (
          <div
            className="bg-bg/80 fixed inset-0 z-50 flex items-end"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="border-border bg-surface max-h-[70vh] w-full overflow-y-auto rounded-t-md border-t p-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 id={titleId} className="font-display text-sm tracking-[0.14em] uppercase">
                  {title}
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
              <div onClick={() => setOpen(false)}>{children}</div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop: the children, plain. */}
      <div className="hidden md:block">{children}</div>
    </>
  );
}
