import { describe, expect, it } from 'vitest';
import { indexTokens, normalizeText, queryTerms, stem } from '../text.js';

// Arabic test words built from code points (no hand-typed Arabic in source).
const ar = (...codes) => String.fromCharCode(...codes);
const ALEF = 0x0627;
const HAMZA_ALEF = 0x0623;
const LAM = 0x0644;
const QAF = 0x0642;
const MEEM = 0x0645;
const YAA = 0x064a;
const SAD = 0x0635;
const FATHA = 0x064e;
const KASRA = 0x0650;
const TATWEEL = 0x0640;
const TAA_MARBUTA = 0x0629;
const HAA = 0x0647;
const DAL = 0x062f;
const RAA = 0x0631;
const SEEN = 0x0633;
const BAA = 0x0628;
const ALEF_MAQSURA = 0x0649;
const ZAIN = 0x0632;
const QAF2 = QAF;

const qamees = ar(QAF, MEEM, YAA, SAD); // "shirt"
const alQamees = ar(ALEF, LAM, QAF, FATHA, MEEM, KASRA, YAA, SAD); // with article + harakat
const madrasa = ar(MEEM, DAL, RAA, SEEN, TAA_MARBUTA); // ends in taa marbuta
const azraq = ar(HAMZA_ALEF, ZAIN, RAA, QAF2); // "blue" with hamza alef

describe('search text normalization', () => {
  it('English: lower-case, accents, plurals', () => {
    expect(normalizeText('CAFÉ Crème')).toBe('cafe creme');
    expect([
      stem('shoes'),
      stem('berries'),
      stem('boxes'),
      stem('glass'),
      stem('bus'),
      stem('bag'),
    ]).toEqual(['shoe', 'berry', 'box', 'glass', 'bus', 'bag']);
    expect(indexTokens("Men's Blue Shirts")).toEqual(['men', 's', 'blue', 'shirts', 'shirt']);
    expect(queryTerms('blue SHIRTS blue')).toEqual(['blue', 'shirt']);
  });

  it('Arabic: harakat, tatweel, hamza alef, taa marbuta, alef maqsura, article', () => {
    expect(normalizeText(alQamees)).toBe(ar(ALEF, LAM) + qamees);
    expect(normalizeText(ar(MEEM, TATWEEL, TATWEEL, DAL))).toBe(ar(MEEM, DAL));
    expect(normalizeText(azraq)).toBe(ar(ALEF, ZAIN, RAA, QAF));
    expect(normalizeText(madrasa)).toBe(ar(MEEM, DAL, RAA, SEEN, HAA));
    expect(normalizeText(ar(MEEM, SEEN, ALEF_MAQSURA))).toBe(ar(MEEM, SEEN, YAA));
    // Indexed with and without the article; a query with or without it finds it.
    expect(indexTokens(alQamees)).toEqual([ar(ALEF, LAM) + qamees, qamees]);
    expect(queryTerms(alQamees)).toEqual([qamees]);
    expect(queryTerms(qamees)).toEqual([qamees]);
    // "bi-al-bayt" (with preposition) also drops the article; short words keep it.
    expect(indexTokens(ar(BAA, ALEF, LAM, BAA, YAA, 0x062a))).toContain(ar(BAA, YAA, 0x062a));
    expect(indexTokens(ar(ALEF, LAM, YAA))).toEqual([ar(ALEF, LAM, YAA)]);
  });

  it('digits are normalized; at most 10 query terms', () => {
    expect(indexTokens(`Rice ${ar(0x0665)}kg`)).toEqual(['rice', '5kg']);
    expect(queryTerms('a b c d e f g h i j k l')).toHaveLength(10);
  });
});
