'use client';

import type { StoredCharacter, WowCharacter } from '@/types';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { SidebarItem, SidebarSwitcher } from '@/components/shared/SidebarSwitcher';
import { Sheet } from '@/components/ui/Sheet';
import { usePreferences } from '@/hooks/usePreferences';

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
      .then((data: unknown) => {
        setCharacters(data as WowCharacter[]);
      })
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
    <Sheet triggerLabel={currentCharacterName} title="Characters">
      <SidebarSwitcher>
        {sorted.map((char) => {
          const isActive =
            char.name.toLowerCase() === currentCharacterName.toLowerCase() &&
            char.realmSlug.toLowerCase() === currentRealmSlug.toLowerCase();
          const stored = toStored(char, region);
          const isFav = isFavourite(stored);
          return (
            <SidebarItem
              key={char.id}
              name={`${char.name}-${char.realmName}`}
              subtitle={char.class}
              isActive={isActive}
              isLoading={isActive && loading}
              onClick={() => onSelect(char.name, char.realmSlug)}
              action={
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavourite(stored);
                  }}
                  title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                  className={`focus-visible:outline-brass-bright cursor-pointer border-none bg-transparent p-1 font-sans text-xs leading-none focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    isFav ? 'text-brass' : 'text-border'
                  }`}
                >
                  ★
                </button>
              }
            />
          );
        })}
      </SidebarSwitcher>
    </Sheet>
  );
}
