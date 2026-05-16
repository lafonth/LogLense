import type { TalentNode } from '@/types';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function getTalentNodes(specId: number): TalentNode[] {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'talents', `spec-${specId}.json`);
    return JSON.parse(readFileSync(filePath, 'utf8')) as TalentNode[];
  } catch {
    return [];
  }
}
