import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Barcode,
  BarcodeInput,
  charFromKeyEvent,
  createWedgeDetector,
  useBarcodeScanner,
} from '../index.js';

describe('charFromKeyEvent', () => {
  it('uses the physical key, so an Arabic keyboard layout still yields A–Z/0–9', () => {
    expect(charFromKeyEvent({ code: 'KeyA', key: 'ش' })).toBe('A'); // Arabic layout letter
    expect(charFromKeyEvent({ code: 'Digit7', key: '٧' })).toBe('7'); // Arabic-Indic digit
    expect(charFromKeyEvent({ code: 'Numpad3', key: '3' })).toBe('3');
    expect(charFromKeyEvent({ code: 'Minus', key: '-', shiftKey: true })).toBe('_');
    expect(charFromKeyEvent({ code: '', key: 'b' })).toBe('B'); // no code → key fallback
    expect(charFromKeyEvent({ code: 'Space', key: ' ' })).toBeNull();
    expect(charFromKeyEvent({ code: 'ShiftLeft', key: 'Shift' })).toBeNull();
  });
});

describe('wedge detector', () => {
  it('accepts fast bursts ending in Enter; rejects human typing and short bursts', () => {
    const d = createWedgeDetector({ minLength: 4, maxGapMs: 50 });
    [...'6281000000007'].forEach((c, i) => d.char(c, 1000 + i * 8));
    expect(d.enter(1000 + 13 * 8)).toBe('6281000000007');

    [...'ABCD'].forEach((c, i) => d.char(c, 5000 + i * 180)); // human speed
    expect(d.enter(5000 + 4 * 180)).toBeNull();

    [...'AB'].forEach((c, i) => d.char(c, 9000 + i * 5));
    expect(d.enter(9012)).toBeNull(); // too short

    // A slow keystroke before a burst doesn't poison the scan.
    d.char('X', 10_000);
    [...'1234'].forEach((c, i) => d.char(c, 11_000 + i * 5));
    expect(d.enter(11_025)).toBe('1234');
  });
});

describe('BarcodeInput', () => {
  function Form({ onSubmit, onScan }) {
    const [value, setValue] = useState('');
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <BarcodeInput
          aria-label="code"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onScan={onScan}
        />
      </form>
    );
  }

  it('maps physical keys under an Arabic layout and Enter scans instead of submitting', () => {
    const onSubmit = vi.fn();
    const onScan = vi.fn();
    render(<Form onSubmit={onSubmit} onScan={onScan} />);
    const input = screen.getByLabelText('code');
    input.focus();
    for (const [code, key] of [
      ['KeyS', 'س'],
      ['KeyK', 'ن'],
      ['KeyU', 'ع'],
      ['Minus', '-'],
      ['Digit1', '١'],
    ]) {
      const notPrevented = fireEvent.keyDown(input, { code, key });
      // Keys whose character is already right are left to the browser (simulate its insertion).
      if (notPrevented) fireEvent.change(input, { target: { value: input.value + key } });
    }
    expect(input).toHaveValue('SKU-1');
    fireEvent.keyDown(input, { code: 'Enter', key: 'Enter' });
    expect(onScan).toHaveBeenCalledWith('SKU-1', input);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('useBarcodeScanner', () => {
  it('reports scans typed outside text fields, swallowing the final Enter', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));
    for (const ch of '6281000000007')
      fireEvent.keyDown(document.body, { code: `Digit${ch}`, key: ch });
    const enter = fireEvent.keyDown(document.body, { code: 'Enter', key: 'Enter' });
    expect(onScan).toHaveBeenCalledWith('6281000000007');
    expect(enter).toBe(false); // default prevented

    render(<input aria-label="field" />);
    const field = screen.getByLabelText('field');
    for (const ch of '12345') fireEvent.keyDown(field, { code: `Digit${ch}`, key: ch });
    fireEvent.keyDown(field, { code: 'Enter', key: 'Enter' });
    expect(onScan).toHaveBeenCalledTimes(1); // fields handle their own input
  });
});

describe('Barcode', () => {
  it('renders EAN-13 for valid GTINs, Code 128 otherwise, nothing for invalid input', () => {
    const { container, rerender } = render(<Barcode value="4006381333931" />);
    expect(container.querySelector('svg').dataset.symbology).toBe('ean13');
    expect(screen.getByRole('img', { name: '4006381333931' })).toBeInTheDocument();
    rerender(<Barcode value="SKU-001" />);
    expect(container.querySelector('svg').dataset.symbology).toBe('code128');
    rerender(<Barcode value={'ش'} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
