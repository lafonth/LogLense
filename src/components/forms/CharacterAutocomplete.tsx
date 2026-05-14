'use client';

import { useEffect, useRef, useState } from 'react';
import { useCharacterSearch } from '@/hooks/useCharacterSearch';

export interface CharacterSelection {
  name: string;
  realmSlug: string;
}

interface CharacterAutocompleteProps {
  region: string;
  value: CharacterSelection | null;
  onChange: (selection: CharacterSelection | null) => void;
  inputStyle: React.CSSProperties;
}

export function CharacterAutocomplete({
  region,
  value,
  onChange,
  inputStyle,
}: CharacterAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { suggestions, loading } = useCharacterSearch(query, region);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    onChange(null);
    setOpen(true);
  }

  function handleSelect(s: { name: string; realmSlug: string; realmName: string }) {
    setQuery(`${s.name} — ${s.realmName}`);
    onChange({ name: s.name, realmSlug: s.realmSlug });
    setOpen(false);
  }

  const showDropdown = open && query.trim().length >= 2 && (loading || suggestions.length > 0);

  // Show the confirmed selection label when value is set and input hasn't been touched since
  const displayValue = value && query.includes(value.name) ? query : query;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        style={{
          ...inputStyle,
          borderRadius: showDropdown ? '4px 4px 0 0' : '4px',
          borderColor: value ? 'var(--gold-dim)' : undefined,
        }}
        type="text"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder="Search character name…"
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
          {loading && suggestions.length === 0 && (
            <div
              style={{
                padding: '8px 12px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                color: 'var(--text-dim)',
              }}
            >
              Searching…
            </div>
          )}
          {suggestions.map((s) => (
            <button
              key={`${s.name}-${s.realmSlug}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(s)}
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
              {s.name}{' '}
              <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>— {s.realmName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
