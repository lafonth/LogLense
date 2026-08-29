'use client';

import type { AccessState, Member, PendingRequest } from '@/lib/access';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BackLink } from '@/components/ui/BackLink';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/**
 * L'écran qui remplace la liste blanche en variable d'environnement.
 *
 * Ce qu'il rend visible tient en trois blocs, dans l'ordre où on s'en sert : la porte
 * — ouverte ou fermée, et jusqu'à quand —, la file des gens qui ont essayé d'entrer, puis
 * les membres admis nominativement. Admettre coûtait un déploiement ; ça coûte un clic.
 */

interface Payload {
  state: AccessState;
  members: Member[];
  pending: PendingRequest[];
  maxOpenDays: number;
}

/** Durée d'ouverture par défaut : la fenêtre de l'étape 5 du plan de saison, deux semaines. */
const DEFAULT_DAYS = 14;

function formatDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AccessAdmin({ admin }: { admin: string }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(String(DEFAULT_DAYS));
  const [manualTag, setManualTag] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/access');
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Payload);
    } catch {
      setError("L'état de l'accès n'a pas pu être lu.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Toute action passe par ici, et se termine par une relecture complète.
   *
   * Recoller la réponse partielle dans l'état local irait plus vite, mais l'écran mentirait
   * dès qu'une admission viendrait d'ailleurs — un second onglet, ou la file qui s'allonge
   * pendant qu'on la traite. La page est le miroir de Redis, pas sa copie.
   */
  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(String(res.status));
        await load();
      } catch {
        setError("L'action a échoué. Rien n'a changé.");
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  if (!data && !error) {
    return (
      <main className="mx-auto flex max-w-3xl justify-center px-4 py-16">
        <LoadingSpinner label="Lecture de l'accès" />
      </main>
    );
  }

  // La porte n'est ouverte que si le mode le dit **et** que la date tient encore. Une fenêtre
  // expirée se lit comme fermée partout ailleurs ; elle doit se lire comme fermée ici aussi.
  const open = data?.state.mode === 'open' && !data.state.expired;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <BackLink onClick={() => router.push('/')}>Retour</BackLink>
        <h1 className="font-display text-text tracking-display text-2xl uppercase">Accès</h1>
        <p className="text-2xs text-dim font-sans">
          Administré par <span className="font-mono">{admin}</span>
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {data && (
        <>
          <Card header="La porte">
            <div className="flex flex-col gap-4">
              <p className="text-text font-sans text-sm">
                {open ? (
                  <>
                    Ouverte à tous jusqu&apos;au{' '}
                    <span className="font-mono">{formatDate(data.state.until ?? '')}</span>.
                  </>
                ) : (
                  <>Fermée — seuls les membres listés ci-dessous entrent.</>
                )}
              </p>

              {data.state.expired && (
                <p className="text-warning text-2xs font-sans">
                  La fenêtre d&apos;ouverture est arrivée à son terme. L&apos;accès est revenu à la
                  liste nominative.
                </p>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <Input
                  label="Jours"
                  type="number"
                  min={1}
                  max={data.maxOpenDays}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-24"
                />
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void act({ action: 'open', days: Number(days) })}
                >
                  {open ? 'Prolonger' : 'Ouvrir'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || !open}
                  onClick={() => void act({ action: 'close' })}
                >
                  Fermer
                </Button>
              </div>

              <p className="text-2xs text-dim font-sans">
                Le plafond horaire Warcraft Logs reste le garde-fou pendant une ouverture. Au plus{' '}
                <span className="font-mono">{data.maxOpenDays}</span> jours : une porte sans date de
                fermeture ne se referme jamais.
              </p>
            </div>
          </Card>

          <Card header={`En attente (${data.pending.length})`}>
            {data.pending.length === 0 ? (
              <p className="text-dim font-sans text-sm">Aucune demande.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.pending.map((p) => (
                  <li
                    key={p.tag}
                    className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-col">
                      <span className="text-text font-mono text-sm">{p.tag}</span>
                      <span className="text-2xs text-dim font-sans">
                        <span className="font-mono">{formatDate(p.requestedAt)}</span>
                        {p.attempts > 1 && (
                          <>
                            {' · '}
                            <span className="font-mono">{p.attempts}</span> tentatives
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="xs"
                        disabled={busy}
                        onClick={() => void act({ action: 'admit', battletag: p.tag })}
                      >
                        Admettre
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={busy}
                        onClick={() => void act({ action: 'dismiss', battletag: p.tag })}
                      >
                        Écarter
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card header={`Membres (${data.members.length})`}>
            <div className="flex flex-col gap-4">
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const tag = manualTag.trim();
                  if (tag === '') return;
                  setManualTag('');
                  void act({ action: 'admit', battletag: tag });
                }}
              >
                <Input
                  label="Admettre un battletag"
                  placeholder="Jumbaa#1234"
                  value={manualTag}
                  onChange={(e) => setManualTag(e.target.value)}
                  className="w-56"
                />
                <Button type="submit" size="sm" disabled={busy}>
                  Admettre
                </Button>
              </form>

              {data.members.length === 0 ? (
                <p className="text-dim font-sans text-sm">
                  Aucun membre. La liste d&apos;amorçage en variable d&apos;environnement reste
                  active et n&apos;apparaît pas ici.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.members.map((m) => (
                    <li
                      key={m.tag}
                      className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0"
                    >
                      <div className="flex flex-col">
                        <span className="text-text font-mono text-sm">{m.tag}</span>
                        <span className="text-2xs text-dim font-sans">
                          <span className="font-mono">{formatDate(m.admittedAt)}</span>
                          {m.admittedBy !== '' && (
                            <>
                              {' · par '}
                              <span className="font-mono">{m.admittedBy}</span>
                            </>
                          )}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={busy}
                        onClick={() => void act({ action: 'revoke', battletag: m.tag })}
                      >
                        Révoquer
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </>
      )}
    </main>
  );
}
