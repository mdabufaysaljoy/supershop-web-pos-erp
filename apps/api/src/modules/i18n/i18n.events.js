import { EVENTS } from '@supershop/shared';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { protectTerm } from './glossary.js';

/**
 * i18n reactions to other modules' events (CLAUDE.md §2.2: side effects via subscribers).
 * - Brand names flagged `protectName` become "never translate" glossary terms, so product text
 *   mentioning them keeps the brand intact in every language.
 */
async function protectBrandName({ payload }) {
  const { after, actorId } = payload ?? {};
  if (!after?.protectName || !after.name?.trim()) return;
  try {
    const termId = await protectTerm(after.name.trim());
    if (termId) {
      void eventBus.emit(EVENTS.GLOSSARY_UPDATED, {
        termId,
        after: { term: after.name.trim(), doNotTranslate: true, source: 'brand' },
        actorId,
      });
    }
  } catch (err) {
    logger.error({ err: { message: err.message } }, 'could not add brand to glossary');
  }
}

let registered = false;
export function registerI18nSubscribers() {
  if (registered) return;
  registered = true;
  eventBus.on(EVENTS.BRAND_CREATED, protectBrandName);
  eventBus.on(EVENTS.BRAND_UPDATED, protectBrandName);
}
