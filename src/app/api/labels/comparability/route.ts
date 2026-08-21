import type { NextRequest } from 'next/server';
import type { ComparabilityLabel } from '@/lib/labels/schema';
import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { appendToCorpus } from '@/lib/labels/corpus';
import { hashUserId } from '@/lib/labels/identity';
import { consumeLabelQuota } from '@/lib/labels/rate-limit';
import { monthKey, parseSubmission } from '@/lib/labels/schema';

export const runtime = 'nodejs';

/**
 * Plafond du corps entrant, en octets.
 *
 * Une soumission légitime fait moins de 600 octets. Les route handlers App Router
 * n'appliquent aucune limite par défaut, et le corpus est en écriture seule : une session
 * valide pourrait pousser en boucle des mégaoctets dans la clé du mois. Saturer Upstash ne
 * détruirait pas que le corpus — c'est le même client qui sert la whitelist d'auth.
 */
const MAX_BODY_BYTES = 4096;

/**
 * Enregistre une décision « pas comparable ».
 *
 * Aucune réponse ne prétend qu'une écriture a eu lieu si elle n'a pas eu lieu : un clic
 * perdu est une donnée perdue, et le corpus est la seule chose que ce produit ne peut pas
 * reconstituer plus tard.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.email ?? session?.user?.name ?? '';
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const submission = parseSubmission(raw);
  if (!submission) {
    return NextResponse.json({ error: 'Invalid label' }, { status: 400 });
  }

  let by: string;
  try {
    by = hashUserId(userId);
  } catch {
    return NextResponse.json({ error: 'Label capture unavailable' }, { status: 503 });
  }

  const at = new Date().toISOString();

  // Le quota se compte sur l'identité hachée, jamais sur l'IP : c'est le compte qui écrit
  // dans le corpus, et c'est lui qu'un flot de verdicts fabriqués empoisonnerait.
  const quota = await consumeLabelQuota(by, Date.parse(at));
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'Too many labels' },
      { status: 429, headers: { 'Retry-After': String(quota.retryAfterSeconds) } }
    );
  }

  const label: ComparabilityLabel = { v: 3, kind: 'verdict', at, by, ...submission };

  try {
    // La longueur renvoyée par Redis reste ici : elle mesure la croissance du corpus, qui
    // est l'actif du produit, et l'appelant n'en a aucun usage.
    const write = await appendToCorpus(monthKey(at), JSON.stringify(label));
    // Un mois plein — ou un `RPUSH` refusé — se dit comme une indisponibilité, pas comme un
    // succès : le verdict n'est pas dans le corpus, et laisser croire le contraire est le
    // seul mensonge que cette route puisse faire.
    if (write !== 'written') {
      return NextResponse.json({ error: 'Label capture unavailable' }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Label capture unavailable' }, { status: 503 });
  }
}
