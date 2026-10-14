import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Autosave (P5.2): the page is saved a moment after the editor stops changing it, and whenever
 * they ask. Nothing is saved WHILE they type — that would be a request per keystroke — and leaving
 * with unsaved work asks for confirmation.
 *
 * @param {{ value: unknown, save: (value: unknown) => Promise<unknown>, delay?: number, enabled?: boolean }} opts
 * @returns {{ status: 'idle'|'unsaved'|'saving'|'saved'|'error', saveNow: () => Promise<void> }}
 */
export function useAutosave({ value, save, delay = 1200, enabled = true }) {
  const [status, setStatus] = useState('idle');
  const latest = useRef(value);
  const saved = useRef(JSON.stringify(value));
  const inFlight = useRef(false);

  // Refs are written in effects, never during render (the React compiler enforces this).
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const flush = useCallback(async () => {
    const snapshot = JSON.stringify(latest.current);
    if (inFlight.current || snapshot === saved.current) return;
    inFlight.current = true;
    setStatus('saving');
    try {
      await save(latest.current);
      saved.current = snapshot;
      setStatus('saved');
    } catch {
      // The editor keeps their work in the page; the next change (or Save) tries again.
      setStatus('error');
    } finally {
      inFlight.current = false;
    }
  }, [save]);

  useEffect(() => {
    if (!enabled || JSON.stringify(value) === saved.current) return undefined;
    setStatus('unsaved');
    const timer = setTimeout(() => void flush(), delay);
    return () => clearTimeout(timer);
  }, [value, delay, enabled, flush]);

  useEffect(() => {
    const warn = (e) => {
      if (JSON.stringify(latest.current) !== saved.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return { status, saveNow: flush };
}
