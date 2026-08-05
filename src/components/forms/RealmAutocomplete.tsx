'use client';

import { useEffect, useRef, useState } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);

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
  }

  function handleSelect(r: Realm) {
    setQuery(r.name);
    onChange({ name: r.name, slug: r.slug });
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        label="Realm"
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => filtered.length > 0 && setOpen(true)}
        placeholder={allRealms.length === 0 ? 'Loading realms…' : 'Search realm…'}
        autoComplete="off"
        spellCheck={false}
        className={value ? 'border-brass-dim' : ''}
      />
      {showDropdown && (
        <div className="border-border bg-surface absolute inset-x-0 top-full z-[100] max-h-64 overflow-y-auto rounded-b-sm border border-t-0">
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(r)}
              className="border-border text-text hover:bg-surface-raised block w-full cursor-pointer border-b px-3 py-2 text-left font-mono text-sm last:border-b-0"
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
