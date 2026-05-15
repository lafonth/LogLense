'use client';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function SidebarSwitcher({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '180px',
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        padding: '20px 12px 20px 0',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
          color: 'var(--gold-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: '10px',
          paddingLeft: '10px',
        }}
      >
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

export function SidebarItem({ name, subtitle, isActive, isLoading, onClick, action }: SidebarItemProps) {
  return (
    <div style={{ position: 'relative', marginBottom: '3px' }}>
      <button
        onClick={() => !isLoading && onClick()}
        disabled={isLoading}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          padding: action ? '7px 28px 7px 10px' : '7px 10px',
          background: isActive ? 'rgba(198,168,74,0.08)' : 'transparent',
          border: isActive ? '1px solid var(--gold-dim)' : '1px solid transparent',
          borderRadius: '4px',
          cursor: isLoading ? 'default' : 'pointer',
          textAlign: 'left',
          gap: '6px',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              color: isActive ? 'var(--gold)' : 'var(--text-dim)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)', opacity: 0.6 }}>
            {subtitle}
          </div>
        </div>
        {isLoading && <LoadingSpinner />}
      </button>
      {action && (
        <div style={{ position: 'absolute', top: '6px', right: '6px' }}>
          {action}
        </div>
      )}
    </div>
  );
}
