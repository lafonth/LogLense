import type { NextRequest } from 'next/server';
import type { ComparabilityLabel } from '@/lib/labels/schema';
import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { hashUserId } from '@/lib/labels/identity';
import { monthKey, parseSubmission } from '@/lib/labels/schema';
import { redisAppend } from '@/lib/redis';

export const runtime = 'nodejs';

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
    raw = await req.json();
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
  const label: ComparabilityLabel = { v: 1, at, by, ...submission };

  try {
    const length = await redisAppend(monthKey(at), JSON.stringify(label));
    return NextResponse.json({ ok: true, length });
  } catch {
    return NextResponse.json({ error: 'Label capture unavailable' }, { status: 503 });
  }
}
