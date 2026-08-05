'use client';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function SidebarSwitcher({ children }: { children: React.ReactNode }) {
  return (
    // Not `ScrollArea`: that primitive is horizontal-overflow only
    // (`w-full max-w-full overflow-x-auto`), for wide content like tables.
    // This list overflows vertically, so it keeps its own `overflow-y-auto`.
    <div className="border-border w-45 shrink-0 overflow-y-auto border-r py-5 pr-3">
      <div className="text-2xs text-muted mb-2 pl-2 font-mono tracking-[0.1em] uppercase">
        Characters
      </div>
      {children}
    </div>
  );
}

interface SidebarItemProps {
  name: string;
  subtitle: string;
  isActive: boolean;
  isLoading: boolean;
  onClick: () => void;
  action?: React.ReactNode;
}

export function SidebarItem({
  name,
  subtitle,
  isActive,
  isLoading,
  onClick,
  action,
}: SidebarItemProps) {
  return (
    <div className="relative mb-1">
      <button
        type="button"
        onClick={() => !isLoading && onClick()}
        disabled={isLoading}
        className={`flex w-full items-center justify-between gap-1.5 rounded-sm border py-2 pl-2 text-left ${
          action ? 'pr-8' : 'pr-2'
        } ${
          isActive ? 'border-brass/40 bg-brass/10' : 'border-transparent'
        } cursor-pointer disabled:cursor-default`}
      >
        <div className="min-w-0">
          <div className={`truncate font-mono text-xs ${isActive ? 'text-brass' : 'text-muted'}`}>
            {name}
          </div>
          <div className="text-2xs text-dim font-mono opacity-60">{subtitle}</div>
        </div>
        {isLoading && <LoadingSpinner />}
      </button>
      {action && <div className="absolute top-1.5 right-1.5">{action}</div>}
    </div>
  );
}
