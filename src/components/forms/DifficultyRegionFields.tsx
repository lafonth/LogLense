import type { AnalysisInput } from '@/types';
import { Select } from '@/components/ui/Select';

interface DifficultyRegionFieldsProps {
  region: AnalysisInput['region'];
  difficulty: AnalysisInput['difficulty'];
  onRegionChange: (region: AnalysisInput['region']) => void;
  onDifficultyChange: (difficulty: AnalysisInput['difficulty']) => void;
}

export function DifficultyRegionFields({
  region,
  difficulty,
  onRegionChange,
  onDifficultyChange,
}: DifficultyRegionFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
      <Select
        label="Region"
        value={region}
        onChange={(e) => onRegionChange(e.target.value as AnalysisInput['region'])}
      >
        {(['US', 'EU', 'KR', 'TW', 'CN'] as const).map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </Select>
      <Select
        label="Difficulty"
        value={difficulty}
        onChange={(e) =>
          onDifficultyChange(Number.parseInt(e.target.value, 10) as AnalysisInput['difficulty'])
        }
      >
        <option value={5}>Mythic</option>
        <option value={4}>Heroic</option>
        <option value={3}>Normal</option>
      </Select>
    </div>
  );
}
