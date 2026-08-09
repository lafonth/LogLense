'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

export function BetaClosedScreen() {
  return (
    <div className="bg-bg text-text flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-[420px] flex-col gap-4">
        <ErrorBanner message="Accès en bêta fermée — ce compte Battle.net n'est pas sur la liste." />
        <Button
          variant="secondary"
          size="xs"
          onClick={() => void signIn('battlenet')}
          className="border-muted text-muted bg-transparent font-mono tracking-wider uppercase"
        >
          Essayer un autre compte
        </Button>
      </div>
    </div>
  );
}
