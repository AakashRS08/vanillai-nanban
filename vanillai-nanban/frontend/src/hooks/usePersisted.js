import { useState } from 'react';

/** useState backed by localStorage; silently falls back to memory if storage is blocked. */
export function usePersisted(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : JSON.parse(raw);
    } catch { return initial; }
  });
  const set = (v) => {
    setValue(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* keep in memory */ }
  };
  return [value, set];
}
