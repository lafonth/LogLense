'use client';

import type { ReportActor } from '@/types';
import { SidebarItem, SidebarSwitcher } from '@/components/shared/SidebarSwitcher';

interface CharacterSwitcherProps {
  actors: ReportActor[];
  selectedActorId: number;
  loading: boolean;
  onSelect: (actor: ReportActor) => void;
}

export function CharacterSwitcher({
  actors,
  selectedActorId,
  loading,
  onSelect,
}: CharacterSwitcherProps) {
  const sorted = actors.slice().sort((a, b) => a.name.localeCompare(b.name));
  return (
    <SidebarSwitcher>
      {sorted.map((actor) => (
        <SidebarItem
          key={actor.id}
          name={actor.name + (actor.server ? `-${actor.server}` : '')}
          subtitle={actor.subType}
          isActive={actor.id === selectedActorId}
          isLoading={actor.id === selectedActorId && loading}
          onClick={() => onSelect(actor)}
        />
      ))}
    </SidebarSwitcher>
  );
}
