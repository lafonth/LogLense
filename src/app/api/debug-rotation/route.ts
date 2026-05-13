import { NextResponse } from 'next/server';
import { getWCLToken } from '@/lib/wcl/auth';
import { gql } from '@/lib/wcl/client';

export const runtime = 'edge';

const Q_DEBUG = `
  query Debug($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
    reportData {
      report(code: $code) {
        buffs:          table(dataType: Buffs,   fightIDs: $fightIDs, sourceID: $sourceID)
        debuffsWithSrc: table(dataType: Debuffs, fightIDs: $fightIDs, sourceID: $sourceID)
        debuffsNoSrc:   table(dataType: Debuffs, fightIDs: $fightIDs)
      }
    }
  }
`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const fightID = Number(searchParams.get('fightID'));
  const sourceID = Number(searchParams.get('sourceID'));

  if (!code || !fightID || !sourceID) {
    return NextResponse.json(
      { error: 'Required: ?code=XXX&fightID=N&sourceID=N' },
      { status: 400 }
    );
  }

  const clientId = process.env.WCL_CLIENT_ID!;
  const clientSecret = process.env.WCL_CLIENT_SECRET!;
  const token = await getWCLToken(clientId, clientSecret);

  const data = await gql<{
    reportData: {
      report: {
        buffs: unknown;
        debuffsWithSrc: unknown;
        debuffsNoSrc: unknown;
      };
    };
  }>(token, Q_DEBUG, { code, fightIDs: [fightID], sourceID });

  const report = data.reportData.report;

  return NextResponse.json({
    buffs_keys: Object.keys(((report.buffs as Record<string, unknown>)?.data as object) ?? {}),
    debuffsWithSrc_keys: Object.keys(
      ((report.debuffsWithSrc as Record<string, unknown>)?.data as object) ?? {}
    ),
    debuffsNoSrc_keys: Object.keys(
      ((report.debuffsNoSrc as Record<string, unknown>)?.data as object) ?? {}
    ),
    buffs_auras_count: ((report.buffs as Record<string, { auras?: unknown[] }>)?.data?.auras ?? [])
      .length,
    debuffsWithSrc_auras: (
      (report.debuffsWithSrc as Record<string, { auras?: { name: string; totalUptime: number }[] }>)
        ?.data?.auras ?? []
    ).slice(0, 10),
    debuffsNoSrc_auras: (
      (report.debuffsNoSrc as Record<string, { auras?: { name: string; totalUptime: number }[] }>)
        ?.data?.auras ?? []
    ).slice(0, 10),
    debuffsWithSrc_entries: (
      (report.debuffsWithSrc as Record<string, { entries?: { name: string; total: number }[] }>)
        ?.data?.entries ?? []
    ).slice(0, 10),
    debuffsNoSrc_entries: (
      (report.debuffsNoSrc as Record<string, { entries?: { name: string; total: number }[] }>)?.data
        ?.entries ?? []
    ).slice(0, 10),
  });
}
