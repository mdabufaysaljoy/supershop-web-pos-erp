import { describe, expect, it } from 'vitest';
import { expandPath, matchesLocalizedPath, queryPathOf, resolveDoc } from '../localized.plugin.js';

const doc = {
  name: { en: 'Shirt', ar: 'A' },
  options: [
    {
      name: { en: 'Color' },
      values: [{ label: { en: 'Red', ar: 'R' } }, { label: { en: 'Blue' } }],
    },
    { name: { en: 'Size' }, values: [] },
  ],
};

describe('localized wildcard paths', () => {
  it('expands patterns against arrays', () => {
    expect(expandPath(doc, 'name')).toEqual(['name']);
    expect(expandPath(doc, 'options.*.name')).toEqual(['options.0.name', 'options.1.name']);
    expect(expandPath(doc, 'options.*.values.*.label')).toEqual([
      'options.0.values.0.label',
      'options.0.values.1.label',
    ]);
    expect(expandPath({}, 'options.*.name')).toEqual([]);
  });

  it('matches concrete paths and builds query paths', () => {
    const patterns = ['name', 'options.*.values.*.label'];
    expect(matchesLocalizedPath(patterns, 'options.3.values.0.label')).toBe(true);
    expect(matchesLocalizedPath(patterns, 'options.x.values.0.label')).toBe(false);
    expect(matchesLocalizedPath(patterns, 'options.0.name')).toBe(false);
    expect(matchesLocalizedPath(patterns, 'customFields.secret')).toBe(false);
    expect(queryPathOf('options.*.values.*.label')).toBe('options.values.label');
  });

  it('resolveDoc resolves inside arrays without mutating the input', () => {
    const before = JSON.stringify(doc);
    const r = resolveDoc(doc, ['name', 'options.*.name', 'options.*.values.*.label'], 'ar');
    expect(r.name).toBe('A');
    expect(r.options[0]).toEqual({ name: 'Color', values: [{ label: 'R' }, { label: 'Blue' }] });
    expect(JSON.stringify(doc)).toBe(before);
  });
});
