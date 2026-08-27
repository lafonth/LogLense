import type { NextRequest } from 'next/server';
import type { ReportFeedbackRecord } from '@/lib/labels/report';
import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { logRouteError } from '@/lib/api/log-error';
import { authOptions } from '@/lib/auth';
import { appendToCorpus } from '@/lib/labels/corpus';
import { hashUserId } from '@/lib/labels/identity';
import { consumeLabelQuota } from '@/lib/labels/rate-limit';
import { parseReportFeedback, reportMonthKey } from '@/lib/labels/report';

export const runtime = 'nodejs';

/**
 * Plafond du corps entrant, en octets. Un retour légitime fait moins de 300 octets ; le
 * plafond borne ce qu'une session valide peut pousser dans une clé qu'on ne nettoie pas.
 */
const MAX_BODY_BYTES = 4096;

/**
 * Enregistre ce qu'un lecteur a fait du rapport IA.
 *
 * Le pendant de `/api/labels/comparability` : là un refus de référence, ici un jugement sur
 * le conseil. Le quota est celui des verdicts — c'est le même geste, un clic de jugement.
 *
 * Aucune réponse ne prétend qu'une écriture a eu lieu si elle n'a pas eu lieu.
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

  const submission = parseReportFeedback(raw);
  if (!submission) {
    return NextResponse.json({ error: 'Invalid feedback' }, { status: 400 });
  }

  let by: string;
  try {
    by = hashUserId(userId);
  } catch {
    return NextResponse.json({ error: 'Feedback capture unavailable' }, { status: 503 });
  }

  const at = new Date().toISOString();

  const quota = await consumeLabelQuota(by, Date.parse(at));
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'Too many labels' },
      { status: 429, headers: { 'Retry-After': String(quota.retryAfterSeconds) } }
    );
  }

  const record: ReportFeedbackRecord = { v: 3, kind: 'feedback', at, by, ...submission };

  try {
    const write = await appendToCorpus(reportMonthKey(at), JSON.stringify(record));
    // Mois plein ou écriture refusée : dans les deux cas le retour n'est pas entré au
    // corpus. Voir la route de comparabilité.
    if (write !== 'written') {
      return NextResponse.json({ error: 'Feedback capture unavailable' }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Idem la route de comparabilité : ce qui n'est pas écrit ici est perdu pour de bon.
    logRouteError('labels-report', error);
    return NextResponse.json({ error: 'Feedback capture unavailable' }, { status: 503 });
  }
}
