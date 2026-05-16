# All DPS Specs Support — Design Spec

**Date:** 2026-05-16
**Status:** Approved

## Context

LogLense's analysis pipeline is hardcoded for Feral Druid (spec ID 103). The WCL GraphQL queries embed `specName: "Feral"` and `className: "Druid"`. The AI report imports `feral-druid-talents.json`. The combatant lookup filters by the Feral spec ID. The stat parser reads `agility` only.

**Goal:** Make the analysis pipeline work for any WoW DPS spec (all ~24 DPS specializations).

---

## Architecture

Five discrete changes, each with a clear boundary:

### 1. Spec Registry (`src/lib/specs.ts`)

A static lookup table mapping every DPS spec ID to its WCL query parameters and primary stat:

```ts
interface SpecInfo {
  specName: string;   // WCL specName value (e.g. "Feral", "Havoc")
  className: string;  // WCL className value (e.g. "Druid", "Demon Hunter")
  primaryStat: 'agility' | 'strength' | 'intellect';
}
const SPECS: Record<number, SpecInfo> = { ... };
```

DPS specs covered (~24 total):
- **Agility**: Feral (103), Balance (102)\*, Enhancement (263), Beast Mastery (253), Marksmanship (254), Survival (255), Assassination (259), Outlaw (260), Subtlety (261), Windwalker (269), Havoc (577)
- **Strength**: Arms (71), Fury (72), Retribution (70), Unholy (252), Frost (251)
- **Intellect**: Arcane (62), Fire (63), Frost Mage (64), Affliction (265), Demonology (266), Destruction (267), Shadow (258), Elemental (262), Devastation (1467), Augmentation (1473)

> \*Balance uses intellect but has the spec ID listed under agility above — see implementation for correction.

### 2. Parameterized WCL Queries

`Q_CHARACTER_RANKINGS` and `Q_WORLD_RANKINGS` accept `$specName: String!` and `$className: String!` variables instead of hardcoded strings. The pipeline passes these from the spec registry.

### 3. Generalized Pipeline

- Remove `FERAL_SPEC_ID` from `constants.ts`
- Rename `getFeralEvent()` → `getCombatantBySpecId(token, code, fightId, specId)` — filters CombatantInfo by `specID` field
- `AnalysisInput` gains `specId: number`
- `analyzeBoss()` looks up `specName`/`className` from the spec registry using `specId`

### 4. Primary Stat Generalization

- `CharacterStats.agility` → `CharacterStats.primaryStat`
- `parseStats()` reads `event.agility ?? event.strength ?? event.intellect ?? 0`
- `StatsTable` label changes from "Agility" to "Primary Stat" (or could show the actual stat name — implementation simplicity wins here)

### 5. Talent Data

- Generalize `scripts/fetch-feral-talents.ts` → `scripts/fetch-spec-talents.ts` — accepts `--spec <id>` CLI argument, outputs to `src/data/talents/spec-{id}.json`
- Run for all 24 DPS spec IDs to pre-generate static JSON files
- New `src/lib/talent-loader.ts`: `getTalentNodes(specId): TalentNode[]` — dynamically imports the right JSON
- `AnalysisResult` carries `specId` so the AI report route can load the correct talent nodes

---

## UI: Spec Picker

### `SpecSelector` Component (`src/components/forms/SpecSelector.tsx`)

Two dropdowns: class (13 playable classes) → spec (DPS specs for that class only). Built from the spec registry. Emits `specId`.

### Character Form (not logged in)

Adds `SpecSelector` below the character/server fields. No default — user must pick class + spec before submitting.

### Logged-In Form

- After a character card is selected, its `class` is already known → pre-filter the spec dropdown to that class
- Trigger a lazy fetch to `GET /api/user/characters/active-spec?name=&realm=&region=` → Blizzard returns the character's active spec ID → pre-select it in the spec dropdown
- If the fetch fails or the spec isn't a DPS spec, fall back to the first DPS spec for that class

### Active Spec API Route (`src/app/api/user/characters/active-spec/route.ts`)

Calls Blizzard `/profile/wow/character/{realm}/{name}` with the session access token. Returns `{ specId: number }`. Used by the logged-in form for the default spec pre-selection.

---

## Data Flow

```
User selects character + spec
       ↓
AnalysisInput { specId, ... }
       ↓
/api/analyze → analyzeBoss()
       ↓
spec registry → specName, className, primaryStat
       ↓
Q_CHARACTER_RANKINGS(specName) + Q_WORLD_RANKINGS(specName, className)
       ↓
getCombatantBySpecId(specId) → CombatantInfo event
       ↓
parseStats() → primaryStat = agility ?? strength ?? intellect
       ↓
BossResult → AnalysisResult { specId, ... }
       ↓
/api/ai-report → getTalentNodes(specId) → correct talent JSON
       ↓
buildAnalysisPrompt(result, talentNodes)
```

---

## Out of Scope

- Healer and tank specs (metrics: `hps`, `tankhps` require different query parameters and prompt logic)
- Runtime talent data fetching (all talent JSONs are pre-generated and bundled)
- Spec auto-detection from WCL logs in the non-logged-in form

---

## Verification

1. Pick a non-Feral DPS character (e.g. a Havoc Demon Hunter) in character mode → analysis completes with correct rankings and spec-appropriate talent tree
2. Pick a logged-in character → active spec is auto-selected in the dropdown
3. Run AI report → coaching text references correct spec abilities
4. `npm run build` exits 0 with no TypeScript errors
5. `npm test` all passing (update tests that reference `agility` or `FERAL_SPEC_ID`)
