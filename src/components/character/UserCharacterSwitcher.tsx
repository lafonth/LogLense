'use client';

import type { StoredCharacter } from '@/types';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { usePreferences } from '@/hooks/usePreferences';

interface WowCharacter {
  id: number;
  name: string;
  realmName: string;
  realmSlug: string;
  class: string;
  level: number;
}

interface UserCharacterSwitcherProps {
  region: string;
  currentCharacterName: string;
  currentRealmSlug: string;
  loading: boolean;
  onSelect: (name: string, realmSlug: string) => void;
}

function toStored(c: WowCharacter, region: string): StoredCharacter {
  return { name: c.name, realmName: c.realmName, realmSlug: c.realmSlug, region, class: c.class };
}

export function UserCharacterSwitcher({
  region,
  currentCharacterName,
  currentRealmSlug,
  loading,
  onSelect,
}: UserCharacterSwitcherProps) {
  const { data: session } = useSession();
  const [characters, setCharacters] = useState<WowCharacter[]>([]);
  const { isFavourite, toggleFavourite } = usePreferences();

  useEffect(() => {
    if (!session) return;
    void fetch(`/api/user/characters?region=${region}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => { setCharacters(data as WowCharacter[]); })
      .catch(() => {});
  }, [session, region]);

  if (!session || characters.length === 0) return null;

  const sorted = characters.slice().sort((a, b) => {
    const aFav = isFavourite(toStored(a, region));
    const bFav = isFavourite(toStored(b, region));
    if (aFav !== bFav) return aFav ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div
      style={{
        width: '180px',
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        padding: '20px 12px 20px 0',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
          color: 'var(--gold-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: '10px',
          paddingLeft: '10px',
        }}
      >
        Characters
      </div>
      {sorted.map((char) => {
        const isActive =
          char.name.toLowerCase() === currentCharacterName.toLowerCase() &&
          char.realmSlug.toLowerCase() === currentRealmSlug.toLowerCase();
        const isLoading = isActive && loading;
        const stored = toStored(char, region);
        const isFav = isFavourite(stored);

        return (
          <div key={char.id} style={{ position: 'relative', marginBottom: '3px' }}>
            <button
              onClick={() => !isLoading && onSelect(char.name, char.realmSlug)}
              disabled={isLoading}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                padding: '7px 28px 7px 10px',
                background: isActive ? 'rgba(198,168,74,0.08)' : 'transparent',
                border: isActive ? '1px solid var(--gold-dim)' : '1px solid transparent',
                borderRadius: '4px',
                cursor: isLoading ? 'default' : 'pointer',
                textAlign: 'left',
                gap: '6px',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                    color: isActive ? 'var(--gold)' : 'var(--text-dim)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {char.name}-{char.realmName}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.65rem',
                    color: 'var(--text-dim)',
                    opacity: 0.6,
                  }}
                >
                  {char.class}
                </div>
              </div>
              {isLoading && <LoadingSpinner />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); toggleFavourite(stored); }}
              title={isFav ? 'Remove from favourites' : 'Add to favourites'}
              style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.75rem',
                color: isFav ? 'var(--gold)' : 'var(--border)',
                lineHeight: 1,
                padding: '2px',
              }}
            >
              ★
            </button>
          </div>
        );
      })}
    </div>
  );
}
