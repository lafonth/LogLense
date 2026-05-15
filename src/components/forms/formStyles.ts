import type * as React from 'react';

export const inputStyle: React.CSSProperties = {
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

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  color: 'var(--gold-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '6px',
};

export const fieldStyle: React.CSSProperties = { marginBottom: '18px' };
