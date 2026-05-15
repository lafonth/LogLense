'use client';

import { signIn, signOut, useSession } from 'next-auth/react';

export function AuthHeader() {
  const { data: session, status } = useSession();

  if (status === 'loading') return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '20px',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      {session ? (
        <>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--gold-dim)',
              letterSpacing: '0.04em',
            }}
          >
            {session.user?.name ?? ''}
          </span>
          <button
            onClick={() => void signOut()}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              padding: '4px 10px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Sign out
          </button>
        </>
      ) : (
        <button
          onClick={() => void signIn('battlenet')}
          style={{
            background: 'none',
            border: '1px solid var(--gold-dim)',
            borderRadius: '4px',
            color: 'var(--gold-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            padding: '4px 12px',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Sign in with Battle.net
        </button>
      )}
    </div>
  );
}
