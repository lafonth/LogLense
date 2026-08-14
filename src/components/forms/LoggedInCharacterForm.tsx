'use client';

import type { AnalysisInput, StoredCharacter, WowCharacter, Zone } from '@/types';
import { useEffect, useState } from 'react';
import { EncounterSelector } from '@/components/forms/EncounterSelector';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Select } from '@/components/ui/Select';
import { usePreferences } from '@/hooks/usePreferences';
import { getDpsSpecsForClass } from '@/lib/specs';
import { DifficultyRegionFields } from './DifficultyRegionFields';

interface LoggedInCharacterFormProps {
  onSubmit: (input: AnalysisInput, zoneId: number) => void;
  loading: boolean;
  zones: Zone[];
  zonesLoading: boolean;
  zonesError: string | null;
  onZonesRetry?: () => void;
}

function toStored(c: WowCharacter, region: string): StoredCharacter {
  return { name: c.name, realmName: c.realmName, realmSlug: c.realmSlug, region, class: c.class };
}

function charKey(c: StoredCharacter) {
  return `${c.name.toLowerCase()}-${c.realmSlug.toLowerCase()}-${c.region.toLowerCase()}`;
}

function CharacterCard({
  char,
  isActive,
  isFav,
  onSelect,
  onToggleFav,
}: {
  char: WowCharacter | StoredCharacter;
  isActive: boolean;
  isFav: boolean;
  onSelect: () => void;
  onToggleFav: (e: React.MouseEvent) => void;
}) {
  const name = char.name;
  const realmName = char.realmName;
  const cls = char.class;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onSelect}
        className={`w-full cursor-pointer rounded-sm border py-2 pr-7 pl-2.5 text-left ${
          isActive ? 'border-brass-dim bg-brass/10' : 'border-border bg-transparent'
        }`}
      >
        <div className={`truncate font-mono text-xs ${isActive ? 'text-brass' : 'text-text'}`}>
          {name}-{realmName}
        </div>
        <div className="text-dim text-2xs truncate font-mono">{cls}</div>
      </button>
      <button
        type="button"
        onClick={onToggleFav}
        title={isFav ? 'Remove from favourites' : 'Add to favourites'}
        className={`focus-visible:outline-brass-bright absolute top-1.5 right-1.5 cursor-pointer border-none bg-transparent p-0.5 font-sans text-xs leading-none focus-visible:outline-2 focus-visible:outline-offset-2 ${
          isFav ? 'text-brass' : 'text-border'
        }`}
      >
        ★
      </button>
    </div>
  );
}

export function LoggedInCharacterForm({
  onSubmit,
  loading,
  zones,
  zonesLoading,
  zonesError,
  onZonesRetry,
}: LoggedInCharacterFormProps) {
  const [region, setRegion] = useState<AnalysisInput['region']>('EU');
  const [characters, setCharacters] = useState<WowCharacter[]>([]);
  const [loadedRegion, setLoadedRegion] = useState<string | null>(null);
  const charsLoading = region !== loadedRegion;
  const [selectedCharKey, setSelectedCharKey] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<AnalysisInput['difficulty']>(4);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedEncounterIds, setSelectedEncounterIds] = useState<Set<number> | null>(null);
  const [specId, setSpecId] = useState<number | null>(null);

  const { favourites, recents, isFavourite, toggleFavourite, addRecent } = usePreferences();

  const activeZoneId = selectedZoneId ?? zones[0]?.id ?? null;
  const currentZone = zones.find((z) => z.id === activeZoneId) ?? null;
  const encounters =
    selectedEncounterIds === null
      ? (currentZone?.encounters ?? [])
      : (currentZone?.encounters ?? []).filter((e) => selectedEncounterIds.has(e.id));

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/user/characters?region=${region}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (cancelled) return;
        setCharacters(data as WowCharacter[]);
        setSelectedCharKey(null);
        setLoadedRegion(region);
      })
      .catch(() => {
        if (cancelled) return;
        setCharacters([]);
        setLoadedRegion(region);
      });
    return () => {
      cancelled = true;
    };
  }, [region]);

  // Build display sections
  const favKeys = new Set(favourites.map(charKey));
  const recentsForRegion = recents.filter(
    (c) => c.region.toLowerCase() === region.toLowerCase() && !favKeys.has(charKey(c))
  );
  const favsForRegion = favourites.filter((c) => c.region.toLowerCase() === region.toLowerCase());
  const shownKeys = new Set([...favsForRegion.map(charKey), ...recentsForRegion.map(charKey)]);
  const rest = characters.filter((c) => !shownKeys.has(charKey(toStored(c, region))));

  async function fetchActiveSpec(char: StoredCharacter): Promise<void> {
    try {
      const res = await fetch(
        `/api/user/characters/active-spec?name=${encodeURIComponent(char.name)}&realm=${encodeURIComponent(char.realmSlug)}&region=${char.region}`
      );
      if (res.ok) {
        const data = (await res.json()) as { specId: number | null };
        if (data.specId) {
          setSpecId(data.specId);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    const specs = getDpsSpecsForClass(char.class);
    if (specs.length > 0) setSpecId(specs[0].specId);
  }

  function resolveChar(): WowCharacter | StoredCharacter | null {
    if (!selectedCharKey) return null;
    const fromApi = characters.find((c) => charKey(toStored(c, region)) === selectedCharKey);
    if (fromApi) return fromApi;
    const fromFav = favsForRegion.find((c) => charKey(c) === selectedCharKey);
    if (fromFav) return fromFav;
    return recentsForRegion.find((c) => charKey(c) === selectedCharKey) ?? null;
  }

  function handleSelect(stored: StoredCharacter) {
    setSelectedCharKey(charKey(stored));
    void fetchActiveSpec(stored);
  }

  function handleZoneChange(zoneId: number) {
    setSelectedZoneId(zoneId);
    setSelectedEncounterIds(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const char = resolveChar();
    if (!char || !activeZoneId || encounters.length === 0 || !specId) return;
    const stored = toStored('id' in char ? char : { id: 0, level: 0, ...char }, region);
    addRecent(stored);
    onSubmit(
      {
        characterName: char.name,
        serverSlug: char.realmSlug,
        region,
        difficulty,
        encounters,
        specId,
      },
      activeZoneId
    );
  }

  const canSubmit =
    !!selectedCharKey && !!specId && encounters.length > 0 && !zonesLoading && !loading;

  function renderGrid(chars: StoredCharacter[]) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5">
        {chars.map((c) => {
          const k = charKey(c);
          return (
            <CharacterCard
              key={k}
              char={c}
              isActive={selectedCharKey === k}
              isFav={isFavourite(c)}
              onSelect={() => handleSelect(c)}
              onToggleFav={(ev) => {
                ev.stopPropagation();
                toggleFavourite(c);
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-5 py-10">
      <h1 className="font-display text-brass mb-2 text-4xl tracking-wide">LogLense</h1>
      <p className="text-dim mb-10 font-mono text-xs">WarcraftLogs analyser</p>

      <form
        onSubmit={handleSubmit}
        className="border-border bg-surface w-full max-w-[560px] rounded-sm border p-8"
      >
        <div className="flex flex-col gap-4">
          <DifficultyRegionFields
            region={region}
            difficulty={difficulty}
            onRegionChange={setRegion}
            onDifficultyChange={setDifficulty}
          />

          <div>
            <div className="text-2xs text-muted mb-1.5 font-sans tracking-widest uppercase">
              Your Characters
              {charsLoading && (
                <span className="text-dim ml-2 font-sans normal-case">Loading…</span>
              )}
            </div>

            <div className="flex max-h-64 flex-col gap-3 overflow-y-auto">
              {favsForRegion.length > 0 && (
                <div>
                  <div className="text-2xs text-dim mb-1.5 font-mono tracking-widest uppercase">
                    ★ Starred
                  </div>
                  {renderGrid(favsForRegion)}
                </div>
              )}

              {recentsForRegion.length > 0 && (
                <div>
                  <div className="text-2xs text-dim mb-1.5 font-mono tracking-widest uppercase">
                    Recent
                  </div>
                  {renderGrid(recentsForRegion)}
                </div>
              )}

              {rest.length > 0 && (
                <div>
                  {(favsForRegion.length > 0 || recentsForRegion.length > 0) && (
                    <div className="text-2xs text-dim mb-1.5 font-mono tracking-widest uppercase">
                      All
                    </div>
                  )}
                  {renderGrid(rest.map((c) => toStored(c, region)))}
                </div>
              )}

              {!charsLoading && characters.length === 0 && favsForRegion.length === 0 && (
                <div className="text-dim py-2 font-mono text-xs">
                  No characters found for this region.
                </div>
              )}
            </div>
          </div>

          <div>
            {zonesLoading ? (
              <>
                <div className="text-2xs text-muted mb-1.5 font-sans tracking-widest uppercase">
                  Raid
                </div>
                <div className="text-dim py-2 font-mono text-xs">Loading raids…</div>
              </>
            ) : zonesError ? (
              <>
                <div className="text-2xs text-muted mb-1.5 font-sans tracking-widest uppercase">
                  Raid
                </div>
                <ErrorBanner message={zonesError} onRetry={onZonesRetry} />
              </>
            ) : (
              <Select
                label="Raid"
                value={selectedZoneId ?? ''}
                onChange={(e) => handleZoneChange(Number.parseInt(e.target.value, 10))}
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {currentZone && (
            <div>
              <div className="text-2xs text-muted mb-1.5 font-sans tracking-widest uppercase">
                Bosses
              </div>
              <EncounterSelector
                available={currentZone.encounters}
                selected={encounters}
                onChange={(encs) => setSelectedEncounterIds(new Set(encs.map((e) => e.id)))}
              />
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!canSubmit}
            className="w-full tracking-wider uppercase"
          >
            {loading ? 'Analysing…' : 'Analyse'}
          </Button>
        </div>
      </form>
    </div>
  );
}
