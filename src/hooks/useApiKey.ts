'use client';

import { useState } from 'react';

function readStored(storageKey: string): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(storageKey) ?? '';
}

export function useApiKey(storageKey = 'loglense_api_key'): [string, (key: string) => void] {
  const [apiKey, setApiKey] = useState(() => readStored(storageKey));

  function persistApiKey(key: string) {
    setApiKey(key);
    if (key) {
      localStorage.setItem(storageKey, key);
    } else {
      localStorage.removeItem(storageKey);
    }
  }

  return [apiKey, persistApiKey];
}
