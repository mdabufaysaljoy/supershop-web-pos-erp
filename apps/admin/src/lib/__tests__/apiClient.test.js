import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { api, ApiError, apiData, refreshAccessToken } from '../apiClient';

const REFRESH = 'POST /api/v1/auth/staff/refresh';
const expired = () => json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } });

beforeEach(() => {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 'old',
    profile: { name: 'A' },
    access: null,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('api()', () => {
  it('sends JSON, credentials and the bearer token; returns the envelope', async () => {
    const m = mockFetch({ 'POST /api/v1/things': json(201, { data: { id: 1 } }) });
    const res = await api('/api/v1/things', { method: 'POST', body: { a: 1 } });
    expect(res).toEqual({ data: { id: 1 } });
    const { init } = m.calls[0];
    expect(init.credentials).toBe('include');
    expect(init.headers.Authorization).toBe('Bearer old');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });

  it('builds query strings, skipping empty values', async () => {
    const m = mockFetch({ 'GET /api/v1/staff': json(200, { data: [] }) });
    await api('/api/v1/staff', { query: { q: 'sa ra', page: 2, status: undefined, roleId: '' } });
    expect(m.calls[0].url.search).toBe('?q=sa+ra&page=2');
  });

  it('throws ApiError with code, details and requestId', async () => {
    mockFetch({
      'POST /api/v1/x': json(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'bad',
          details: [{ path: 'email' }],
          requestId: 'r-1',
        },
      }),
    });
    const err = await api('/api/v1/x', { method: 'POST', body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ path: 'email' }],
      requestId: 'r-1',
    });
  });

  it('maps non-JSON failures and network errors to stable codes', async () => {
    mockFetch({ 'GET /api/v1/a': () => new Response('<html>Bad gateway</html>', { status: 502 }) });
    expect((await api('/api/v1/a').catch((e) => e)).code).toBe('INTERNAL_ERROR');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect((await api('/api/v1/a').catch((e) => e)).code).toBe('NETWORK_ERROR');
  });

  it('returns null for 204', async () => {
    mockFetch({ 'DELETE /api/v1/a': () => new Response(null, { status: 204 }) });
    expect(await api('/api/v1/a', { method: 'DELETE' })).toBeNull();
  });
});

describe('token refresh', () => {
  it('refreshes once on TOKEN_EXPIRED and retries with the new token', async () => {
    let n = 0;
    const m = mockFetch({
      'GET /api/v1/me': ({ init }) =>
        (n += 1) === 1 ? expired() : json(200, { data: { auth: init.headers.Authorization } }),
      [REFRESH]: json(200, { data: { accessToken: 'new' } }),
    });
    expect(await apiData('/api/v1/me')).toEqual({ auth: 'Bearer new' });
    expect(m.count(REFRESH)).toBe(1);
    const refreshCall = m.calls.find((c) => c.key === REFRESH);
    expect(refreshCall.init.headers['X-CSRF-Protection']).toBe('1');
    expect(useAuthStore.getState().accessToken).toBe('new');
  });

  it('is single-flight: concurrent expired requests share ONE refresh (rotation-safe)', async () => {
    let refreshes = 0;
    const m = mockFetch({
      'GET /api/v1/a': ({ init }) =>
        init.headers.Authorization === 'Bearer new' ? json(200, { data: 'a' }) : expired(),
      'GET /api/v1/b': ({ init }) =>
        init.headers.Authorization === 'Bearer new' ? json(200, { data: 'b' }) : expired(),
      [REFRESH]: async () => {
        refreshes += 1;
        await new Promise((r) => setTimeout(r, 20));
        return json(200, { data: { accessToken: 'new' } });
      },
    });
    const [a, b] = await Promise.all([apiData('/api/v1/a'), apiData('/api/v1/b')]);
    expect([a, b]).toEqual(['a', 'b']);
    expect(refreshes).toBe(1);
    expect(m.count(REFRESH)).toBe(1);
  });

  it('retries only once (no refresh loop)', async () => {
    const m = mockFetch({
      'GET /api/v1/a': expired(),
      [REFRESH]: json(200, { data: { accessToken: 'new' } }),
    });
    expect((await api('/api/v1/a').catch((e) => e)).code).toBe('TOKEN_EXPIRED');
    expect(m.count(REFRESH)).toBe(1);
    expect(m.count('GET /api/v1/a')).toBe(2);
  });

  it('a failed refresh ends the session', async () => {
    mockFetch({
      'GET /api/v1/a': expired(),
      [REFRESH]: json(401, { error: { code: 'TOKEN_INVALID' } }),
    });
    expect((await api('/api/v1/a').catch((e) => e)).status).toBe(401);
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', accessToken: null });
  });

  it('a revoked session (TOKEN_INVALID) clears state without trying to refresh', async () => {
    const m = mockFetch({ 'GET /api/v1/a': json(401, { error: { code: 'TOKEN_INVALID' } }) });
    await api('/api/v1/a').catch(() => {});
    expect(m.count(REFRESH)).toBe(0);
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('auth:false calls (login) never refresh or clear the session', async () => {
    const m = mockFetch({
      'POST /api/v1/auth/staff/login': json(401, { error: { code: 'INVALID_CREDENTIALS' } }),
    });
    useAuthStore.setState({ status: 'anonymous', accessToken: null });
    const err = await api('/api/v1/auth/staff/login', {
      method: 'POST',
      body: {},
      auth: false,
    }).catch((e) => e);
    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(m.count(REFRESH)).toBe(0);
    expect(m.calls[0].init.headers.Authorization).toBeUndefined();
  });

  it('refreshAccessToken returns null on network failure without clearing the session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await refreshAccessToken()).toBeNull();
    expect(useAuthStore.getState().status).toBe('authenticated');
  });
});
