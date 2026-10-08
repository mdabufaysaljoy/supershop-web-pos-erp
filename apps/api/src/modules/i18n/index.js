/**
 * i18n module — public API (CLAUDE.md §5.7). Content modules use `LocalizedString` +
 * `localized` plugin; public responses use `resolveDoc`; everything machine-translated goes through
 * `translate`.
 */
export {
  LocalizedString,
  localized,
  resolveDoc,
  revertToAuto,
  scheduleEntityTranslation,
  setManualTranslation,
} from './localized.plugin.js';
export { translate, isTranslationEnabled, getMonthlyUsage } from './translate.service.js';
export { getTargetLanguages, loadLanguages, seedLanguages } from './languages.js';
export { bumpGlossaryVersion, seedGlossary } from './glossary.js';
export { processTranslationJob, startTranslationWorker } from './i18n.jobs.js';
export { createI18nAdminRouter } from './admin.routes.js';
