import type { AnalysisInput } from '@/types';
import { fieldStyle, inputStyle, labelStyle } from './formStyles';

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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="df-region">Region</label>
        <select
          id="df-region"
          style={inputStyle}
          value={region}
          onChange={(e) => onRegionChange(e.target.value as AnalysisInput['region'])}
        >
          {(['US', 'EU', 'KR', 'TW', 'CN'] as const).map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="df-difficulty">Difficulty</label>
        <select
          id="df-difficulty"
          style={inputStyle}
          value={difficulty}
          onChange={(e) =>
            onDifficultyChange(Number.parseInt(e.target.value, 10) as AnalysisInput['difficulty'])
          }
        >
          <option value={5}>Mythic</option>
          <option value={4}>Heroic</option>
          <option value={3}>Normal</option>
        </select>
      </div>
    </div>
  );
}
