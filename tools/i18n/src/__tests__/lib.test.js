import { describe, expect, it } from 'vitest';
import { diffCatalog, flatten, hash, placeholders, unflatten, usedKeys } from '../lib.js';

const en = { 'home.title': 'Welcome to {{store}}', 'home.intro': 'Hello', 'nav.home': 'Home' };
const gen = (value, src) => ({ src: hash(src), out: hash(value) });

describe('flatten / unflatten', () => {
  it('round-trips and keeps the source key order', () => {
    const nested = { b: { y: '2', x: '1' }, a: 'A' };
    const flat = flatten(nested);
    expect(flat).toEqual({ 'b.y': '2', 'b.x': '1', a: 'A' });
    expect(JSON.stringify(unflatten({ a: 'Z', 'b.x': 'X', 'b.y': 'Y' }, flat))).toBe(
      '{"b":{"y":"Y","x":"X"},"a":"Z"}',
    );
  });
});

describe('diffCatalog', () => {
  const target = { 'home.title': 'T {{store}}', 'home.intro': 'I', 'nav.home': 'H' };
  const lock = {
    'home.title': gen('T {{store}}', en['home.title']),
    'home.intro': gen('I', en['home.intro']),
    'nav.home': gen('H', en['nav.home']),
  };

  it('clean catalog → nothing to do', () => {
    expect(diffCatalog(en, target, lock)).toEqual({ toTranslate: [], problems: [], warnings: [] });
  });

  it('detects missing, stale, hand-edited, orphan and placeholder problems', () => {
    const t2 = { ...target, 'nav.home': 'edited by a human', 'old.key': 'x' };
    delete t2['home.intro'];
    const en2 = { ...en, 'home.title': 'Welcome to {{store}}!' };
    const { toTranslate, problems } = diffCatalog(en2, t2, lock);
    expect(toTranslate.sort()).toEqual(['home.intro', 'home.title', 'nav.home']);
    expect(problems.map((p) => `${p.key}:${p.issue.split(' ')[0]}`).sort()).toEqual([
      'home.intro:missing',
      'home.title:stale',
      'nav.home:edited',
      'old.key:orphan',
    ]);
    const lostPh = diffCatalog(
      en,
      { ...target, 'home.title': 'T' },
      { ...lock, 'home.title': gen('T', en['home.title']) },
    );
    expect(lostPh.problems[0].issue).toMatch(/placeholder mismatch/);
  });

  it('manual entries are not stale when English changes, but still must match their lock', () => {
    const manualLock = { ...lock, 'nav.home': { ...gen('H', 'old english'), mode: 'manual' } };
    expect(diffCatalog(en, target, manualLock).problems).toEqual([]);
  });

  it('engine failures for the CURRENT English are warnings (retried), stale failures are problems', () => {
    const t2 = { ...target };
    delete t2['nav.home'];
    const failed = { ...lock, 'nav.home': { src: hash(en['nav.home']), status: 'failed' } };
    const r = diffCatalog(en, t2, failed);
    expect(r.problems).toEqual([]);
    expect(r.warnings.map((w) => w.key)).toEqual(['nav.home']);
    expect(r.toTranslate).toEqual(['nav.home']);
    const staleFailed = { ...lock, 'nav.home': { src: hash('older english'), status: 'failed' } };
    expect(diffCatalog(en, t2, staleFailed).problems.map((p) => p.issue)).toEqual(['missing']);
  });

  it('values without a lock entry (hand-added) are rejected', () => {
    expect(diffCatalog(en, target, {}).problems.every((p) => /no lock entry/.test(p.issue))).toBe(
      true,
    );
  });
});

describe('helpers', () => {
  it('placeholders and t() key scanning', () => {
    expect(placeholders('Hi {{ name }}, {{count}} items')).toEqual(['count', 'name']);
    const code = `t('home.title'); t("nav.home", {}); i18n.t('x.y'); format('no'); const at = 1; t(\`errors.\${c}\`)`;
    expect(usedKeys(code)).toEqual(['home.title', 'nav.home']);
    // documentation examples in comments are ignored; URLs survive comment stripping
    expect(
      usedKeys("/** Use `t('key')` */ // t('other')\nconst u = 'https://x.y'; t('real.key')"),
    ).toEqual(['real.key']);
  });
});
