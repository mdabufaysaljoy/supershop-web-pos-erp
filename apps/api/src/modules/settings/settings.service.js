import { EVENTS, PERMISSIONS, SETTING_GROUPS, SETTINGS } from '@supershop/shared';
import { decryptSecret, encryptSecret, maskSecret } from '../../core/crypto.js';
import { withTransaction } from '../../core/db.js';
import {
  BadRequestError,
  ForbiddenError,
  ValidationError,
  zodIssuesToDetails,
} from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import * as repo from './settings.repo.js';

/**
 * Settings registry runtime (CLAUDE.md §2.4).
 * - `getSetting(key)` is SYNCHRONOUS: values live in an in-memory cache loaded at startup and kept
 *   fresh by `settings.sync.js` (Redis pub/sub + periodic reload). Missing key → registry default.
 * - Writes are validated with the definition's zod schema, permission-checked per group,
 *   transactional, and emit `settings.updated` (audited, secrets masked).
 */

/** @type {Map<string, import('@supershop/shared').SettingDefinition>} */
const definitions = new Map(SETTINGS.map((d) => [d.key, d]));
/** @type {Map<string, { value: unknown, updatedAt?: Date }>} */
let cache = new Map();

const deepFreeze = (v) => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    Object.values(v).forEach(deepFreeze);
  }
  return v;
};

const aadFor = (key) => `setting:${key}`;

/**
 * Lets an API module add server-only settings (e.g. provider secrets) without touching shared.
 * @param {import('@supershop/shared').SettingDefinition[]} defs
 */
export function registerSettingDefinitions(defs) {
  for (const d of defs) {
    if (definitions.has(d.key) && definitions.get(d.key) !== d)
      throw new Error(`Duplicate setting ${d.key}`);
    if (!(d.group in SETTING_GROUPS)) throw new Error(`Setting ${d.key}: unknown group ${d.group}`);
    if (d.public && d.secret) throw new Error(`Setting ${d.key} cannot be public and secret`);
    definitions.set(d.key, Object.freeze(d));
  }
}

function definitionOf(key) {
  const def = definitions.get(key);
  if (!def) throw new Error(`Unknown setting "${key}"`);
  return def;
}

/** Decodes a stored doc into a validated value; invalid/undecryptable → null (default used). */
function decode(doc) {
  const def = definitions.get(doc.key);
  if (!def) return null; // stale key from a removed definition — ignored
  try {
    const raw = def.secret
      ? JSON.parse(decryptSecret(doc.encryptedValue, { aad: aadFor(doc.key) }))
      : doc.value;
    const parsed = def.schema.safeParse(raw);
    if (parsed.success) return { value: deepFreeze(parsed.data), updatedAt: doc.updatedAt };
    logger.warn({ key: doc.key }, 'stored setting no longer matches its schema; using default');
  } catch {
    logger.error({ key: doc.key }, 'stored secret setting could not be decrypted; using default');
  }
  return null;
}

/** (Re)loads every override from the DB into the cache. */
export async function loadSettings() {
  const docs = await repo.findAllSettings();
  const next = new Map();
  for (const doc of docs) {
    const decoded = decode(doc);
    if (decoded) next.set(doc.key, decoded);
  }
  cache = next;
  return cache.size;
}

/**
 * Current value (override or default). Deep-frozen — never mutate.
 * Secrets must be read with getSecretSetting (keeps them out of generic code paths/responses).
 * @param {string} key
 */
export function getSetting(key) {
  const def = definitionOf(key);
  if (def.secret) throw new Error(`"${key}" is secret — use getSecretSetting()`);
  return cache.has(key) ? cache.get(key).value : deepFreeze(structuredClone(def.default));
}

/** @param {string} key  @returns {unknown} plaintext secret or the default (usually null) */
export function getSecretSetting(key) {
  const def = definitionOf(key);
  if (!def.secret) throw new Error(`"${key}" is not secret`);
  return cache.has(key) ? cache.get(key).value : def.default;
}

/** Shape returned to admins. Secrets: `{ isSet, masked }` only. */
function present(def, actor) {
  const entry = cache.get(def.key);
  const value = def.secret
    ? {
        isSet: entry?.value != null,
        masked: entry?.value != null ? maskSecret(String(entry.value)) : '',
      }
    : entry
      ? entry.value
      : def.default;
  return {
    key: def.key,
    group: def.group,
    value,
    isDefault: !entry,
    secret: Boolean(def.secret),
    public: Boolean(def.public),
    editable: actor.can(SETTING_GROUPS[def.group]),
    updatedAt: entry?.updatedAt ?? null,
  };
}

const maskForAudit = (def, value) =>
  def.secret ? (value == null ? null : maskSecret(String(value))) : value;

/** @param {import('../../core/access.js').AccessContext} actor */
export function listSettings(actor, { group } = {}) {
  actor.assert(PERMISSIONS.SETTINGS_VIEW);
  return [...definitions.values()]
    .filter((d) => !group || d.group === group)
    .map((d) => present(d, actor));
}

/** Public settings for the storefront: `{ key: value }`. */
export function getPublicSettings() {
  const out = {};
  for (const d of definitions.values()) if (d.public) out[d.key] = getSetting(d.key);
  return out;
}

/** Validates keys/permissions; throws ONE error listing every problem. */
function checkWritable(actor, keys) {
  const unknown = keys.filter((k) => !definitions.has(k));
  if (unknown.length) {
    throw new BadRequestError(
      'Unknown setting keys',
      unknown.map((k) => ({ path: k, code: 'unknown_key' })),
    );
  }
  const denied = keys.filter((k) => !actor.can(SETTING_GROUPS[definitions.get(k).group]));
  if (denied.length)
    throw new ForbiddenError(`Missing permission for settings: ${denied.join(', ')}`);
}

let publishChange = async () => {};
/** settings.sync.js installs the cross-process notifier. */
export function setChangePublisher(fn) {
  publishChange = fn;
}

async function commit(actor, changes) {
  // changes: [{ def, next: { value } | null (reset) }]
  const audit = [];
  await withTransaction(async (session) => {
    for (const { def, next } of changes) {
      if (next === null) {
        await repo.deleteSettings([def.key], { session });
      } else {
        await repo.upsertSetting(
          def.key,
          def.secret
            ? {
                encryptedValue: encryptSecret(JSON.stringify(next.value), { aad: aadFor(def.key) }),
                updatedBy: actor.staffId,
              }
            : { value: next.value, updatedBy: actor.staffId },
          { session },
        );
      }
    }
  });

  for (const { def, next } of changes) {
    const before = cache.has(def.key) ? cache.get(def.key).value : def.secret ? null : def.default;
    if (next === null) cache.delete(def.key);
    else cache.set(def.key, { value: deepFreeze(next.value), updatedAt: new Date() });
    const after = next === null ? (def.secret ? null : def.default) : next.value;
    audit.push({
      key: def.key,
      before: maskForAudit(def, before),
      after: maskForAudit(def, after),
    });
  }

  void eventBus.emit(EVENTS.SETTINGS_UPDATED, { changes: audit, actorId: actor.staffId });
  await publishChange(changes.map((c) => c.def.key)).catch((err) =>
    logger.warn(
      { err: { message: err.message } },
      'settings change broadcast failed (peers reload on interval)',
    ),
  );
}

/**
 * Updates several settings atomically. `values` = { key: newValue }.
 * Secrets: a string sets it, `null` clears it; omit the key to keep the current secret.
 * @param {import('../../core/access.js').AccessContext} actor
 * @param {Record<string, unknown>} values
 */
export async function updateSettings(actor, values) {
  const keys = Object.keys(values);
  if (!keys.length) throw new BadRequestError('No settings provided');
  checkWritable(actor, keys);

  const details = [];
  const changes = [];
  for (const key of keys) {
    const def = definitions.get(key);
    if (def.secret && values[key] === null) {
      changes.push({ def, next: null });
      continue;
    }
    const parsed = def.schema.safeParse(values[key]);
    if (!parsed.success) {
      details.push(
        ...zodIssuesToDetails(parsed.error.issues).map((d) => ({
          ...d,
          path: [key, d.path].filter(Boolean).join('.'),
        })),
      );
    } else {
      changes.push({ def, next: { value: parsed.data } });
    }
  }
  if (details.length) throw new ValidationError(details);

  await commit(actor, changes);
  return keys.map((k) => present(definitions.get(k), actor));
}

/** Removes overrides so the keys return to their defaults. */
export async function resetSettings(actor, keys) {
  checkWritable(actor, keys);
  await commit(
    actor,
    keys.map((k) => ({ def: definitions.get(k), next: null })),
  );
  return keys.map((k) => present(definitions.get(k), actor));
}

/** Group names for the admin UI tabs. */
export const listGroups = () => Object.keys(SETTING_GROUPS);
