/* eslint-disable no-console -- CLI */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CATALOGS, SOURCE } from '../catalogs.config.js';
import { catalogPaths, readJson, ROOT, sourceFiles } from './io.js';
import { diffCatalog, flatten, usedKeys } from './lib.js';

/**
 * `npm run i18n:check` — CI gate (no network). Fails when:
 * - a target language file is missing, stale, has orphan keys, placeholder mismatches, or was
 *   edited by hand (output differs from what the pipeline generated);
 * - code calls t('some.key') that doesn't exist in en.json (would render the raw key).
 */
let failures = 0;
let warningCount = 0;

for (const catalog of CATALOGS) {
  const source = flatten(readJson(catalogPaths(catalog, SOURCE).file, {}));
  const lock = readJson(catalogPaths(catalog, SOURCE).lock, {});

  for (const lang of catalog.targets) {
    const target = flatten(readJson(catalogPaths(catalog, lang).file, {}));
    const { problems, warnings } = diffCatalog(source, target, lock[lang] ?? {});
    for (const p of problems) console.error(`✖ [${catalog.name}/${lang}] ${p.key}: ${p.issue}`);
    for (const w of warnings) console.warn(`⚠ [${catalog.name}/${lang}] ${w.key}: ${w.issue}`);
    failures += problems.length;
    warningCount += warnings.length;
  }

  for (const file of sourceFiles(catalog.scan[0])) {
    const code = readFileSync(file, 'utf8');
    for (const key of usedKeys(code)) {
      // i18next plurals: t('x', { count }) resolves `x_one` / `x_other`. (English-only catalogs;
      // Arabic needs zero/two/few/many forms too — avoid plurals in storefront strings for now.)
      if (!(key in source) && !(`${key}_other` in source)) {
        console.error(
          `✖ [${catalog.name}] ${path.relative(ROOT, file)}: t('${key}') is not in ${SOURCE}.json`,
        );
        failures += 1;
      }
    }
  }
}

if (failures) {
  console.error(
    `\n${failures} i18n problem(s). Run \`npm run i18n:translate\` (needs the translation provider) and commit the result.`,
  );
  process.exit(1);
}
console.info(
  `✔ i18n catalogs are up to date${warningCount ? ` (${warningCount} string(s) shown in English — see ⚠ above)` : ''}`,
);
