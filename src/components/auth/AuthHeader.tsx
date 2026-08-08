'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';

export function AuthHeader() {
  const { data: session, status } = useSession();

  if (status === 'loading') return null;

  return (
    <div className="flex w-full items-center justify-end gap-2.5 p-4">
      {session ? (
        <>
          <span className="text-muted text-2xs font-mono tracking-wide">
            {session.user?.name ?? ''}
          </span>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => void signOut()}
            className="bg-transparent font-mono tracking-wider uppercase"
          >
            Sign out
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          size="xs"
          onClick={() => void signIn('battlenet')}
          className="border-muted text-muted bg-transparent font-mono tracking-wider uppercase"
        >
          Sign in with Battle.net
        </Button>
      )}
    </div>
  );
}
