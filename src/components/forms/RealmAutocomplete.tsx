'use client';

import { useEffect, useRef, useState } from 'react';

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
  inputStyle: React.CSSProperties;
}

export function RealmAutocomplete({ region, value, onChange, inputStyle }: RealmAutocompleteProps) {
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
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        style={{
          ...inputStyle,
          borderRadius: showDropdown ? '4px 4px 0 0' : '4px',
          borderColor: value ? 'var(--gold-dim)' : undefined,
        }}
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => filtered.length > 0 && setOpen(true)}
        placeholder={allRealms.length === 0 ? 'Loading realms…' : 'Search realm…'}
        autoComplete="off"
        spellCheck={false}
      />
      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
            maxHeight: '220px',
            overflowY: 'auto',
            zIndex: 100,
          }}
        >
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(r)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
