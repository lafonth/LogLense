import configJson from '../../config.json';
import type { AnalysisInput } from '@/types';

export function loadConfig(): AnalysisInput {
  return {
    characterName: configJson.character_name,
    serverSlug: configJson.server_slug,
    region: configJson.server_region as AnalysisInput['region'],
    difficulty: configJson.difficulty as AnalysisInput['difficulty'],
    encounters: configJson.encounters,
  };
}
