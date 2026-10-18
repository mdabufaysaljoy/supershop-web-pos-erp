import { getRedis } from './redis.js';
import { logger } from './logger.js';

/**
 * Standard cache key namespaces.
 */
export const CACHE_KEYS = {
  categoryTree: (lang) => `supershop:cache:categories:tree:${lang}`,
  categoryTreePattern: () => 'supershop:cache:categories:tree:*',
  publicTracking: () => 'supershop:cache:tracking:public',
  publicProduct: (slug, lang) => `supershop:cache:product:${slug}:${lang}`,
  publicProductPattern: (slug = '*') => `supershop:cache:product:${slug}:*`,
  siteChrome: (lang) => `supershop:cache:site:chrome:${lang}`,
  siteChromePattern: () => 'supershop:cache:site:chrome:*',
};

/**
 * Safe JSON parser.
 * @param {string | null} str
 */
function safeJsonParse(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Gets a cached item by key from Redis.
 * @template T
 * @param {string} key
 * @returns {Promise<T | null>}
 */
export async function cacheGet(key) {
  try {
    const raw = await getRedis().get(key);
    return safeJsonParse(raw);
  } catch (err) {
    logger.debug({ key, err: err.message }, 'Redis cache get error (falling through)');
    return null;
  }
}

/**
 * Sets a cached item in Redis with a TTL in seconds.
 * @param {string} key
 * @param {unknown} value
 * @param {number} [ttlSeconds=300]
 * @returns {Promise<boolean>}
 */
export async function cacheSet(key, value, ttlSeconds = 300) {
  try {
    const raw = JSON.stringify(value);
    await getRedis().set(key, raw, 'EX', Math.max(1, ttlSeconds));
    return true;
  } catch (err) {
    logger.debug({ key, err: err.message }, 'Redis cache set error');
    return false;
  }
}

/**
 * Deletes one or more keys from Redis.
 * @param {...string} keys
 * @returns {Promise<number>}
 */
export async function cacheDel(...keys) {
  const validKeys = keys.filter(Boolean);
  if (!validKeys.length) return 0;
  try {
    return await getRedis().del(...validKeys);
  } catch (err) {
    logger.debug({ keys: validKeys, err: err.message }, 'Redis cache delete error');
    return 0;
  }
}

/**
 * Cache-aside helper with graceful fallback to source on cache miss or Redis error.
 * @template T
 * @param {string} key
 * @param {number} ttlSeconds
 * @param {() => Promise<T>} fetcherFn
 * @returns {Promise<T>}
 */
export async function cacheRemember(key, ttlSeconds, fetcherFn) {
  const cached = await cacheGet(key);
  if (cached !== null && cached !== undefined) {
    return cached;
  }

  const fresh = await fetcherFn();
  if (fresh !== null && fresh !== undefined) {
    void cacheSet(key, fresh, ttlSeconds);
  }
  return fresh;
}

/**
 * Safely invalidates all keys matching a glob pattern using SCAN stream (never KEYS *).
 * @param {string} pattern
 * @returns {Promise<number>} deleted count
 */
export async function cacheInvalidatePattern(pattern) {
  try {
    const redis = getRedis();
    const stream = redis.scanStream({ match: pattern, count: 100 });
    let count = 0;

    return await new Promise((resolve) => {
      stream.on('data', async (keys = []) => {
        if (keys.length > 0) {
          count += keys.length;
          stream.pause();
          try {
            await redis.del(...keys);
          } finally {
            stream.resume();
          }
        }
      });
      stream.on('end', () => resolve(count));
      stream.on('error', (err) => {
        logger.debug({ pattern, err: err.message }, 'Redis scan stream error');
        resolve(count);
      });
    });
  } catch (err) {
    logger.debug({ pattern, err: err.message }, 'Redis cache invalidate pattern error');
    return 0;
  }
}
