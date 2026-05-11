'use client';

import { useState } from 'react';

const STORAGE_KEY = 'loglense_api_key';

function readStored(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

export function useApiKey(): [string, (key: string) => void] {
  const [apiKey, setApiKey] = useState(readStored);

  function persistApiKey(key: string) {
    setApiKey(key);
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return [apiKey, persistApiKey];
}
