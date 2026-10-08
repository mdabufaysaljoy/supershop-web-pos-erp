import { describe, expect, it, vi } from 'vitest';
import { ApiError, buildApiUrl, createApiClient } from '../api/client.js';

const res = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

describe('createApiClient', () => {
  it('returns the envelope and passes headers + extra fetch options through', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { data: { ok: true } }));
    const api = createApiClient({
      baseUrl: 'http://api:4000/',
      fetchImpl,
      headers: { 'Accept-Language': 'ar' },
    });
    const out = await api.get('/api/v1/x', {
      query: { a: 1, b: '' },
      extra: { next: { revalidate: 60 } },
    });
    expect(out).toEqual({ data: { ok: true } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://api:4000/api/v1/x?a=1');
    expect(init.headers['Accept-Language']).toBe('ar');
    expect(init.next).toEqual({ revalidate: 60 });
  });

  it('serializes JSON bodies and handles 204', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const api = createApiClient({ fetchImpl, credentials: 'include' });
    expect(await api.request('/x', { method: 'POST', body: { a: 1 } })).toBeNull();
    const init = fetchImpl.mock.calls[0][1];
    expect(init).toMatchObject({ method: 'POST', body: '{"a":1}', credentials: 'include' });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('maps API errors, gateway pages and network failures to ApiError codes', async () => {
    const api = (r) => createApiClient({ fetchImpl: vi.fn().mockImplementation(r) });
    const e1 = await api(async () =>
      res(409, { error: { code: 'CONFLICT', details: { fields: ['email'] }, requestId: 'r1' } }),
    )
      .get('/x')
      .catch((e) => e);
    expect(e1).toBeInstanceOf(ApiError);
    expect(e1).toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: { fields: ['email'] },
      requestId: 'r1',
    });
    const e2 = await api(async () => new Response('<html>502</html>', { status: 502 }))
      .get('/x')
      .catch((e) => e);
    expect(e2.code).toBe('INTERNAL_ERROR');
    const e3 = await api(async () => {
      throw new TypeError('fetch failed');
    })
      .get('/x')
      .catch((e) => e);
    expect(e3).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('buildApiUrl skips empty values', () => {
    expect(buildApiUrl('', '/a', { q: 'x y', n: 0, u: undefined })).toBe('/a?q=x+y&n=0');
  });
});
