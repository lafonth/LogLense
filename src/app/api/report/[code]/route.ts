import type { NextRequest } from 'next/server';
import type { ReportMeta } from '@/types';
import { NextResponse } from 'next/server';
import { guardWclSpend, METADATA_UNITS } from '@/lib/api/wcl-guard';
import { getWCLToken } from '@/lib/wcl/auth';
import { gql } from '@/lib/wcl/client';
import { Q_REPORT_META } from '@/lib/wcl/queries';

export const runtime = 'nodejs';

interface RawReportMeta {
  reportData: {
    report: {
      title: string;
      fights: {
        id: number;
        name: string;
        encounterID: number;
        kill: boolean | null;
        startTime: number;
        endTime: number;
        difficulty: number;
      }[];
      masterData: {
        actors: {
          id: number;
          name: string;
          type: string;
          subType: string;
          server: string | null;
        }[];
      };
    } | null;
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!code || !/^[a-z0-9]{16}$/i.test(code)) {
    return NextResponse.json({ error: 'Invalid report code' }, { status: 400 });
  }

  const refusal = await guardWclSpend('report', METADATA_UNITS);
  if (refusal) return refusal;

  const clientId = process.env.WCL_CLIENT_ID!;
  const clientSecret = process.env.WCL_CLIENT_SECRET!;
  const token = await getWCLToken(clientId, clientSecret);

  const data = await gql<RawReportMeta>(token, Q_REPORT_META, { code });
  const report = data.reportData.report;
  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const meta: ReportMeta = {
    title: report.title,
    fights: report.fights
      .filter((f) => f.encounterID > 0)
      .map((f) => ({ ...f, kill: f.kill ?? false })),
    actors: report.masterData.actors.filter((a) => a.type === 'Player'),
  };

  return NextResponse.json(meta);
}
