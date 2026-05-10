'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'loglense_api_key';

export function useApiKey(): [string, (key: string) => void] {
  const [apiKey, setApiKeyState] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setApiKeyState(stored);
  }, []);

  function setApiKey(key: string) {
    setApiKeyState(key);
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return [apiKey, setApiKey];
}
