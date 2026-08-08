'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';

interface Realm {
  id: number;
  name: string;
  slug: string;
}

export interface RealmSelection {
  name: string;
  slug: string;
}

interface RealmAutocompleteProps {
  region: string;
  value: RealmSelection | null;
  onChange: (selection: RealmSelection | null) => void;
}

export function RealmAutocomplete({ region, value, onChange }: RealmAutocompleteProps) {
  const [allRealms, setAllRealms] = useState<Realm[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // Position dans la liste filtrée, -1 quand rien n'est mis en avant. C'est un curseur
  // visuel, pas un focus : le focus reste dans le champ, sinon la frappe suivante ne
  // l'atteindrait plus.
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  // Load realm list when region changes
  useEffect(() => {
    void fetch(`/api/search/realm?region=${region}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAllRealms(data as Realm[]))
      .catch(() => {});
  }, [region]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered =
    query.trim().length >= 1
      ? allRealms
          .filter((r) => r.name.toLowerCase().startsWith(query.trim().toLowerCase()))
          .slice(0, 10)
      : [];

  const showDropdown = open && query.trim().length >= 1 && filtered.length > 0;

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    onChange(null);
    setOpen(true);
    setHighlighted(-1);
  }

  function handleSelect(r: Realm) {
    setQuery(r.name);
    onChange({ name: r.name, slug: r.slug });
    setOpen(false);
    setHighlighted(-1);
  }

  /**
   * La liste ne se parcourait qu'à la souris : au clavier, la seule façon d'atteindre un
   * royaume était d'en taper le nom complet. Les flèches bouclent, Entrée valide, Échap
   * referme sans rien choisir.
   */
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      setHighlighted(-1);
      return;
    }
    if (!showDropdown) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((current) => (current + step + filtered.length) % filtered.length);
      return;
    }
    if (e.key === 'Enter') {
      const choice = filtered[highlighted];
      if (!choice) return;
      // Seulement quand une option est mise en avant : sinon Entrée doit rester la
      // soumission du formulaire.
      e.preventDefault();
      handleSelect(choice);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        label="Realm"
        type="text"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => filtered.length > 0 && setOpen(true)}
        placeholder={allRealms.length === 0 ? 'Loading realms…' : 'Search realm…'}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showDropdown && highlighted >= 0 ? optionId(highlighted) : undefined}
        className={value ? 'border-brass-dim' : ''}
      />
      {showDropdown && (
        <div
          id={listId}
          role="listbox"
          aria-label="Realm"
          className="border-border bg-surface absolute inset-x-0 top-full z-[100] max-h-64 overflow-y-auto rounded-b-sm border border-t-0"
        >
          {filtered.map((r, index) => (
            <button
              key={r.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === highlighted}
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => handleSelect(r)}
              className={`border-border text-text hover:bg-surface-raised block w-full cursor-pointer border-b px-3 py-2 text-left font-mono text-sm last:border-b-0 ${
                index === highlighted ? 'bg-surface-raised' : ''
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
