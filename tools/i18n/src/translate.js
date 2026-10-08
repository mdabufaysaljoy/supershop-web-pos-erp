/* eslint-disable no-console -- CLI */
import { parseArgs } from 'node:util';
import { CATALOGS, SOURCE } from '../catalogs.config.js';
import { catalogPaths, readJson, writeJson } from './io.js';
import { diffCatalog, flatten, hash, unflatten } from './lib.js';

/**
 * `npm run i18n:translate` — fills target-language files for new/changed English keys through the
 * SAME pipeline as content (masking, glossary, cache, validation): apps/api/src/modules/i18n.
 * Needs MongoDB (glossary + cache) and a translation provider:
 *   - from settings (i18n.provider), or
 *   - flags: --provider libretranslate --url http://localhost:5000
 * Never overwrites keys locked as `manual` in i18n.lock.json. Removes orphan keys. Strings the engine
 * cannot translate are recorded as `status: failed` (English served, CI warning) and retried next run.
 */
const { values: args } = parseArgs({
  options: {
    provider: { type: 'string' },
    url: { type: 'string' },
    catalog: { type: 'string' },
    // Re-translate every non-manual key (e.g. after switching to a better provider).
    force: { type: 'boolean', default: false },
  },
});

const { connectDb, disconnectDb } = await import('../../../apps/api/src/core/db.js');
const { closeRedis } = await import('../../../apps/api/src/core/redis.js');
const { loadSettings } = await import('../../../apps/api/src/modules/settings/index.js');
const { createTranslationProvider } =
  await import('../../../apps/api/src/adapters/translation/index.js');
const { isTranslationEnabled, setTranslationProviderOverride, translate } =
  await import('../../../apps/api/src/modules/i18n/translate.service.js');

await connectDb();
let exitCode = 0;
try {
  await loadSettings();
  if (args.provider) {
    setTranslationProviderOverride(
      createTranslationProvider({ provider: args.provider, libretranslateUrl: args.url }),
    );
  }
  if (!isTranslationEnabled()) {
    throw new Error(
      'Translation provider is off. Start it (`docker compose --profile translation up -d`) and pass ' +
        '`--provider libretranslate --url http://localhost:5000`, or set i18n.provider in Settings.',
    );
  }

  for (const catalog of CATALOGS.filter((c) => !args.catalog || c.name === args.catalog)) {
    const sourceNested = readJson(catalogPaths(catalog, SOURCE).file, {});
    const source = flatten(sourceNested);
    const lockFile = catalogPaths(catalog, SOURCE).lock;
    const lock = readJson(lockFile, {});

    for (const lang of catalog.targets) {
      const target = flatten(readJson(catalogPaths(catalog, lang).file, {}));
      const langLock = { ...(lock[lang] ?? {}) };
      const candidates = args.force
        ? Object.keys(source)
        : diffCatalog(source, target, langLock).toTranslate;
      const todo = candidates.filter((k) => langLock[k]?.mode !== 'manual');

      let done = 0;
      let failed = 0;
      if (todo.length) {
        const { results } = await translate({ texts: todo.map((k) => source[k]), to: lang });
        todo.forEach((key, i) => {
          if (results[i] == null) {
            // Recorded so CI shows it as a visible warning (English served) instead of "missing".
            console.warn(
              `⚠ [${catalog.name}/${lang}] ${key}: engine could not translate — English will be shown`,
            );
            delete target[key];
            langLock[key] = { src: hash(source[key]), status: 'failed' };
            failed += 1;
            return;
          }
          target[key] = results[i];
          langLock[key] = { src: hash(source[key]), out: hash(results[i]) };
          done += 1;
        });
      }

      // Drop orphans (keys removed from English).
      for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
      for (const key of Object.keys(langLock)) if (!(key in source)) delete langLock[key];

      writeJson(catalogPaths(catalog, lang).file, unflatten(target, source));
      lock[lang] = Object.fromEntries(
        Object.keys(source)
          .filter((k) => langLock[k])
          .map((k) => [k, langLock[k]]),
      );
      console.info(
        `✔ [${catalog.name}/${lang}] ${done} translated, ${failed} kept in English, ${Object.keys(source).length} keys total`,
      );
    }
    if (catalog.targets.length) writeJson(lockFile, lock);
  }
} catch (err) {
  console.error(`✖ ${err.message}`);
  exitCode = 1;
} finally {
  await disconnectDb();
  await closeRedis();
}
process.exit(exitCode);
