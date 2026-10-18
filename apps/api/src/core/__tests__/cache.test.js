import { describe, expect, it, vi } from 'vitest';
import * as redisModule from '../redis.js';
import {
  CACHE_KEYS,
  cacheDel,
  cacheGet,
  cacheInvalidatePattern,
  cacheRemember,
  cacheSet,
} from '../cache.js';

describe('CACHE_KEYS', () => {
  it('generates predictable namespaced keys', () => {
    expect(CACHE_KEYS.categoryTree('en')).toBe('supershop:cache:categories:tree:en');
    expect(CACHE_KEYS.categoryTreePattern()).toBe('supershop:cache:categories:tree:*');
    expect(CACHE_KEYS.siteChrome('ar')).toBe('supershop:cache:site:chrome:ar');
    expect(CACHE_KEYS.siteChromePattern()).toBe('supershop:cache:site:chrome:*');
    expect(CACHE_KEYS.publicTracking()).toBe('supershop:cache:tracking:public');
  });
});

describe('cache helpers resilience', () => {
  it('handles get gracefully when Redis throws an error', async () => {
    vi.spyOn(redisModule, 'getRedis').mockReturnValueOnce({
      get: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });

    const result = await cacheGet('some-key');
    expect(result).toBeNull();
  });

  it('handles set gracefully when Redis throws an error', async () => {
    vi.spyOn(redisModule, 'getRedis').mockReturnValueOnce({
      set: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });

    const success = await cacheSet('some-key', { foo: 'bar' });
    expect(success).toBe(false);
  });

  it('handles del gracefully when Redis throws an error', async () => {
    vi.spyOn(redisModule, 'getRedis').mockReturnValueOnce({
      del: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });

    const count = await cacheDel('some-key');
    expect(count).toBe(0);
  });

  it('handles empty keys in cacheDel', async () => {
    const count = await cacheDel();
    expect(count).toBe(0);
  });

  it('falls back to fetcherFn when Redis fails in cacheRemember', async () => {
    vi.spyOn(redisModule, 'getRedis').mockReturnValue({
      get: vi.fn().mockRejectedValue(new Error('Connection refused')),
      set: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });

    const fetcher = vi.fn().mockResolvedValue({ status: 'ok' });
    const result = await cacheRemember('test-key', 60, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 'ok' });
  });

  it('returns cached value without calling fetcherFn on cache hit', async () => {
    vi.spyOn(redisModule, 'getRedis').mockReturnValueOnce({
      get: vi.fn().mockResolvedValue(JSON.stringify({ cached: true })),
    });

    const fetcher = vi.fn().mockResolvedValue({ cached: false });
    const result = await cacheRemember('hit-key', 60, fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toEqual({ cached: true });
  });

  it('calls fetcherFn and sets cache on cache miss', async () => {
    const mockSet = vi.fn().mockResolvedValue('OK');
    vi.spyOn(redisModule, 'getRedis').mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      set: mockSet,
    });

    const fetcher = vi.fn().mockResolvedValue({ fresh: true });
    const result = await cacheRemember('miss-key', 120, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ fresh: true });
    expect(mockSet).toHaveBeenCalledWith('miss-key', JSON.stringify({ fresh: true }), 'EX', 120);
  });

  it('invalidates matching keys with SCAN stream in cacheInvalidatePattern', async () => {
    const mockDel = vi.fn().mockResolvedValue(2);
    const mockScanStream = vi.fn().mockReturnValue({
      on(event, handler) {
        if (event === 'data') {
          setTimeout(() => handler(['key1', 'key2']), 5);
        }
        if (event === 'end') {
          setTimeout(handler, 15);
        }
        return this;
      },
      pause: vi.fn(),
      resume: vi.fn(),
    });

    vi.spyOn(redisModule, 'getRedis').mockReturnValueOnce({
      scanStream: mockScanStream,
      del: mockDel,
    });

    const deleted = await cacheInvalidatePattern('supershop:cache:test:*');
    expect(deleted).toBe(2);
    expect(mockScanStream).toHaveBeenCalledWith({ match: 'supershop:cache:test:*', count: 100 });
    expect(mockDel).toHaveBeenCalledWith('key1', 'key2');
  });
});
