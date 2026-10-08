import { createLibreTranslateProvider } from './libretranslate.js';
import { noopProvider } from './noop.js';

/**
 * Translation provider adapters (CLAUDE.md §5.7). Business code never talks to a vendor directly.
 *
 * Interface:
 *   {
 *     name: string,
 *     enabled: boolean,                              // false → translation is off (noop)
 *     translateBatch(texts: string[], { from, to }): Promise<string[]>   // same order & length
 *     health?(): Promise<boolean>
 *   }
 * Inputs are already MASKED (placeholders/HTML/numbers/glossary replaced by ⟦n⟧ tokens) and never
 * contain customer PII. Outputs are untrusted and validated by the i18n module.
 * Adding a provider (google/azure/deepl/llm) = new file here + a branch below + a settings enum value.
 */

/**
 * @param {{ provider: string, libretranslateUrl?: string, apiKey?: string | null, fetchImpl?: typeof fetch }} cfg
 */
export function createTranslationProvider(cfg) {
  switch (cfg.provider) {
    case 'libretranslate':
      return createLibreTranslateProvider({
        baseUrl: cfg.libretranslateUrl,
        apiKey: cfg.apiKey,
        fetchImpl: cfg.fetchImpl,
      });
    case 'noop':
    default:
      return noopProvider;
  }
}
