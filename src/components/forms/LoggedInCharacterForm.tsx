'use client';

import type { AnalysisInput, StoredCharacter, Zone } from '@/types';
import { useEffect, useState } from 'react';
import { EncounterSelector } from '@/components/forms/EncounterSelector';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { usePreferences } from '@/hooks/usePreferences';

interface WowCharacter {
  id: number;
  name: string;
  realmName: string;
  realmSlug: string;
  class: string;
  level: number;
}

interface LoggedInCharacterFormProps {
  onSubmit: (input: AnalysisInput, zoneId: number) => void;
  loading: boolean;
  zones: Zone[];
  zonesLoading: boolean;
  zonesError: string | null;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.9rem',
  padding: '8px 12px',
  width: '100%',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  color: 'var(--gold-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '6px',
};

const fieldStyle: React.CSSProperties = { marginBottom: '18px' };

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.62rem',
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: '6px',
  opacity: 0.6,
};

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
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onSelect}
        style={{
          width: '100%',
          padding: '8px 28px 8px 10px',
          background: isActive ? 'rgba(198,168,74,0.08)' : 'transparent',
          border: isActive ? '1px solid var(--gold-dim)' : '1px solid var(--border)',
          borderRadius: '4px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.82rem',
            color: isActive ? 'var(--gold)' : 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}-{realmName}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            color: 'var(--text-dim)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {cls}
        </div>
      </button>
      <button
        type="button"
        onClick={onToggleFav}
        title={isFav ? 'Remove from favourites' : 'Add to favourites'}
        style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.82rem',
          color: isFav ? 'var(--gold)' : 'var(--border)',
          lineHeight: 1,
          padding: '2px',
        }}
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
}: LoggedInCharacterFormProps) {
  const [region, setRegion] = useState<AnalysisInput['region']>('EU');
  const [characters, setCharacters] = useState<WowCharacter[]>([]);
  const [charsLoading, setCharsLoading] = useState(false);
  const [selectedCharKey, setSelectedCharKey] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<AnalysisInput['difficulty']>(4);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedEncounterIds, setSelectedEncounterIds] = useState<Set<number> | null>(null);

  const { favourites, recents, isFavourite, toggleFavourite, addRecent } = usePreferences();

  const activeZoneId = selectedZoneId ?? zones[0]?.id ?? null;
  const currentZone = zones.find((z) => z.id === activeZoneId) ?? null;
  const encounters =
    selectedEncounterIds === null
      ? (currentZone?.encounters ?? [])
      : (currentZone?.encounters ?? []).filter((e) => selectedEncounterIds.has(e.id));

  useEffect(() => {
    setCharsLoading(true);
    setSelectedCharKey(null);
    void fetch(`/api/user/characters?region=${region}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => { setCharacters(data as WowCharacter[]); })
      .catch(() => { setCharacters([]); })
      .finally(() => { setCharsLoading(false); });
  }, [region]);

  // Build display sections
  const favKeys = new Set(favourites.map(charKey));
  const recentsForRegion = recents.filter(
    (c) => c.region.toLowerCase() === region.toLowerCase() && !favKeys.has(charKey(c))
  );
  const favsForRegion = favourites.filter(
    (c) => c.region.toLowerCase() === region.toLowerCase()
  );
  const shownKeys = new Set([...favsForRegion.map(charKey), ...recentsForRegion.map(charKey)]);
  const rest = characters.filter((c) => !shownKeys.has(charKey(toStored(c, region))));

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
  }

  function handleZoneChange(zoneId: number) {
    setSelectedZoneId(zoneId);
    setSelectedEncounterIds(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const char = resolveChar();
    if (!char || !activeZoneId || encounters.length === 0) return;
    const stored = toStored(
      'id' in char ? char : { id: 0, level: 0, ...char },
      region
    );
    addRecent(stored);
    onSubmit(
      {
        characterName: char.name,
        serverSlug: char.realmSlug,
        region,
        difficulty,
        encounters,
      },
      activeZoneId
    );
  }

  const canSubmit = !!selectedCharKey && encounters.length > 0 && !zonesLoading && !loading;

  function renderGrid(chars: StoredCharacter[]) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '6px',
        }}
      >
        {chars.map((c) => {
          const k = charKey(c);
          return (
            <CharacterCard
              key={k}
              char={c}
              isActive={selectedCharKey === k}
              isFav={isFavourite(c)}
              onSelect={() => handleSelect(c)}
              onToggleFav={(ev) => { ev.stopPropagation(); toggleFavourite(c); }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(198,168,74,0.06) 0%, var(--bg) 60%)',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '3rem',
          color: 'var(--gold)',
          marginBottom: '8px',
          letterSpacing: '0.04em',
        }}
      >
        LogLense
      </h1>
      <p
        style={{
          color: 'var(--text-dim)',
          fontSize: '0.85rem',
          marginBottom: '40px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        WarcraftLogs analyser
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '32px',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Region</label>
            <select
              style={inputStyle}
              value={region}
              onChange={(e) => setRegion(e.target.value as AnalysisInput['region'])}
            >
              {(['US', 'EU', 'KR', 'TW', 'CN'] as const).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Difficulty</label>
            <select
              style={inputStyle}
              value={difficulty}
              onChange={(e) =>
                setDifficulty(Number.parseInt(e.target.value, 10) as AnalysisInput['difficulty'])
              }
            >
              <option value={5}>Mythic</option>
              <option value={4}>Heroic</option>
              <option value={3}>Normal</option>
            </select>
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>
            Your Characters
            {charsLoading && (
              <span style={{ marginLeft: '8px', color: 'var(--text-dim)', opacity: 0.6, textTransform: 'none' }}>
                Loading…
              </span>
            )}
          </label>

          <div
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {favsForRegion.length > 0 && (
              <div>
                <div style={sectionLabelStyle}>★ Starred</div>
                {renderGrid(favsForRegion)}
              </div>
            )}

            {recentsForRegion.length > 0 && (
              <div>
                <div style={sectionLabelStyle}>Recent</div>
                {renderGrid(recentsForRegion)}
              </div>
            )}

            {rest.length > 0 && (
              <div>
                {(favsForRegion.length > 0 || recentsForRegion.length > 0) && (
                  <div style={sectionLabelStyle}>All</div>
                )}
                {renderGrid(rest.map((c) => toStored(c, region)))}
              </div>
            )}

            {!charsLoading && characters.length === 0 && favsForRegion.length === 0 && (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.82rem',
                  color: 'var(--text-dim)',
                  padding: '8px 0',
                }}
              >
                No characters found for this region.
              </div>
            )}
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Raid</label>
          {zonesLoading ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-dim)', padding: '8px 0' }}>
              Loading raids…
            </div>
          ) : zonesError ? (
            <ErrorBanner message={zonesError} />
          ) : (
            <select
              style={inputStyle}
              value={selectedZoneId ?? ''}
              onChange={(e) => handleZoneChange(Number.parseInt(e.target.value, 10))}
            >
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          )}
        </div>

        {currentZone && (
          <div style={fieldStyle}>
            <label style={labelStyle}>Bosses</label>
            <EncounterSelector
              available={currentZone.encounters}
              selected={encounters}
              onChange={(encs) => setSelectedEncounterIds(new Set(encs.map((e) => e.id)))}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            width: '100%',
            padding: '12px',
            background: canSubmit ? 'var(--crimson)' : 'var(--border)',
            color: 'var(--text)',
            border: 'none',
            borderRadius: '4px',
            fontFamily: 'var(--font-display)',
            fontSize: '1rem',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            letterSpacing: '0.06em',
            marginTop: '8px',
          }}
        >
          {loading ? 'Analysing…' : 'Analyse'}
        </button>
      </form>
    </div>
  );
}
