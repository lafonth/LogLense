import type { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import {
  admit,
  dismiss,
  isAdminTag,
  isBattletag,
  listMembers,
  listPending,
  MAX_OPEN_DAYS,
  readAccessState,
  revoke,
  setAccessMode,
} from '@/lib/access';
import { isOneOf, isRecord, isStr, readJson } from '@/lib/api/parse';
import { authOptions } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * L'administration de l'accès : lire l'état, ouvrir, fermer, admettre, révoquer, écarter.
 *
 * Le garde ne lit **que** `ADMIN_BATTLETAGS`, jamais Redis. C'est l'invariant du module :
 * une identité d'administrateur qui se lirait dans la base se laisserait écrire par qui sait
 * y écrire, et cette route est précisément ce qui sait y écrire. Elle se promouvrait
 * elle-même.
 *
 * Le battletag vient de `session.user.name` — c'est là que le rappel `jwt` le pose, après
 * l'avoir demandé à Battle.net. Un client ne le choisit pas.
 */
async function requireAdmin(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const tag = session?.user?.name ?? '';
  return tag !== '' && isAdminTag(tag) ? tag : null;
}

/**
 * Le même corps pour le non-authentifié et pour le connecté qui n'administre pas.
 *
 * 404 plutôt que 403 : répondre « interdit » confirmerait à un compte quelconque que la route
 * existe, donc qu'il y a une liste d'administrateurs quelque part à deviner. Elle n'existe pas
 * pour qui n'y est pas.
 */
function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function GET() {
  if (!(await requireAdmin())) return notFound();

  // Les trois lectures sont indépendantes : la porte, la liste, la file. Aucune ne dépend du
  // résultat d'une autre, elles partent ensemble.
  const [state, members, pending] = await Promise.all([
    readAccessState(),
    listMembers(),
    listPending(),
  ]);

  return NextResponse.json({ state, members, pending, maxOpenDays: MAX_OPEN_DAYS });
}

const ACTIONS = ['open', 'close', 'admit', 'revoke', 'dismiss'] as const;

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return notFound();

  const body = await readJson(req);
  if (!isRecord(body) || !isOneOf(body.action, ACTIONS)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  if (body.action === 'open') {
    // Le jour est borné ici comme il l'est dans `setAccessMode` : la route refuse ce qui n'a
    // pas de sens plutôt que de le rogner en silence, le module borne quand même — un appelant
    // futur ne doit pas pouvoir ouvrir pour mille jours parce qu'il a oublié de valider.
    const days = typeof body.days === 'number' ? body.days : Number.NaN;
    if (!Number.isInteger(days) || days < 1 || days > MAX_OPEN_DAYS) {
      return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });
    }
    return NextResponse.json({ state: await setAccessMode('open', days, admin) });
  }

  if (body.action === 'close') {
    return NextResponse.json({ state: await setAccessMode('closed', 0, admin) });
  }

  // Les trois actions restantes portent sur un battletag. La forme est vérifiée avant
  // l'écriture : le battletag devient un champ de hash, et un champ de hash sans forme est une
  // clé arbitraire écrite par le client dans notre base.
  const tag = isStr(body.battletag) ? body.battletag.trim() : '';
  if (!isBattletag(tag)) {
    return NextResponse.json({ error: 'Invalid battletag' }, { status: 400 });
  }

  if (body.action === 'admit') await admit(tag, admin);
  else if (body.action === 'revoke') await revoke(tag);
  else await dismiss(tag);

  const [members, pending] = await Promise.all([listMembers(), listPending()]);
  return NextResponse.json({ members, pending });
}
