'use client';

import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      // Move focus into panel when it opens
      closeRef.current?.focus();
    }
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    // Return focus to trigger when panel closes
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleClose();
    }
  };

  return (
    <>
      {/* Mobile: a trigger, then a panel. Hidden from md up. */}
      <div className="md:hidden">
        <Button
          ref={triggerRef}
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          {triggerLabel}
        </Button>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end">
            <div className="bg-bg/80 absolute inset-0" onClick={handleClose} aria-hidden="true" />
            {/* `relative` on the panel is load-bearing: the backdrop is absolutely positioned
                and would otherwise paint over this static block, swallowing every click. */}
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="border-border bg-surface relative max-h-[70vh] w-full overflow-y-auto rounded-t-md border-t p-4"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handleKeyDown}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 id={titleId} className="font-display tracking-caps text-sm uppercase">
                  {title}
                </h2>
                <Button ref={closeRef} variant="ghost" size="sm" onClick={handleClose}>
                  Close
                </Button>
              </div>
              {/* Selecting an item from this sheet closes it, since consumers are
                  the boss list and character switcher where picking means submit. */}
              <div onClick={handleClose}>{children}</div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop: the children, plain. */}
      <div className="hidden md:block">{children}</div>
    </>
  );
}
