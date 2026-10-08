import { useEffect, useRef } from 'react';
import { charFromKeyEvent, isEnter } from './keys.js';
import { createWedgeDetector } from './wedge.js';

const isEditable = (el) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) &&
  !el.closest('[data-scan-global]');

/**
 * Page-level scanner: calls `onScan(code)` when a barcode is scanned while focus is NOT in a text
 * field (fields use <BarcodeInput>). The Enter that ends a scan is swallowed so it can't click a
 * focused button.
 * @param {{ onScan: (code: string) => void, enabled?: boolean, minLength?: number, maxGapMs?: number }} opts
 */
export function useBarcodeScanner({ onScan, enabled = true, minLength, maxGapMs }) {
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  });
  useEffect(() => {
    if (!enabled) return undefined;
    const detector = createWedgeDetector({ minLength, maxGapMs });
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return;
      if (isEnter(e)) {
        const code = detector.enter(e.timeStamp);
        if (code) {
          e.preventDefault();
          handler.current(code);
        }
        return;
      }
      const ch = charFromKeyEvent(e);
      if (ch) detector.char(ch, e.timeStamp);
      else detector.reset();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, minLength, maxGapMs]);
}
