import { useRef } from 'react';
import { tabId, tabPanelId } from './tab-ids';

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

/**
 * Une barre d'onglets qui se parcourt aux flèches.
 *
 * Le motif ARIA veut un seul arrêt de tabulation pour toute la barre : la touche Tab entre
 * dans le groupe et en sort, les flèches choisissent dedans. Avec un `tabindex` par bouton,
 * une barre de cinq onglets impose cinq tabulations avant d'atteindre le contenu.
 */
export function Tabs({ tabs, active, onChange }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function focusTab(index: number) {
    const wrapped = (index + tabs.length) % tabs.length;
    const target = tabs[wrapped];
    if (!target) return;
    onChange(target.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(target.id))}`)?.focus();
  }

  const MOVES: Record<string, (index: number) => number> = {
    ArrowRight: (index) => index + 1,
    ArrowLeft: (index) => index - 1,
    Home: () => 0,
    End: () => tabs.length - 1,
  };

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const move = MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    focusTab(move(index));
  }

  return (
    <div ref={listRef} role="tablist" className="border-border flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={tabId(tab.id)}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={tabPanelId(tab.id)}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={() => onChange(tab.id)}
            className={`focus-visible:outline-brass-bright shrink-0 cursor-pointer border-b-2 px-4 py-2.5 font-sans text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${
              selected ? 'border-brass text-text' : 'text-muted hover:text-text border-transparent'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
