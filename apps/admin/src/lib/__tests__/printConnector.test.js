import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';

/**
 * P6.3 — the local print agent. The shop picks QZ Tray or NanoPrint and nothing above this file
 * changes, so what is worth pinning down is the difference between them: QZ Tray prints nothing
 * the shop's own key has not signed, NanoPrint signs nothing and is told the shop's name instead.
 */
const STATUS = 'GET /api/v1/printing/status';
const CERT = 'GET /api/v1/printing/certificate';
const SIGN = 'POST /api/v1/printing/sign';

/** A stand-in for the `qz-tray` client, recording how the connector wires it up. */
function fakeClient() {
  const wiring = { certificate: null, signature: null, algorithm: null, printed: [] };
  return {
    wiring,
    security: {
      setCertificatePromise: (factory) => {
        wiring.certificate = factory;
      },
      setSignaturePromise: (factory) => {
        wiring.signature = factory;
      },
      setSignatureAlgorithm: (algorithm) => {
        wiring.algorithm = algorithm;
      },
    },
    websocket: {
      isActive: () => wiring.connected === true,
      connect: vi.fn(async () => {
        wiring.connected = true;
      }),
      disconnect: vi.fn(async () => {
        wiring.connected = false;
      }),
    },
    printers: { find: vi.fn(async () => ['EPSON TM-T20', 'Zebra ZD220']) },
    configs: { create: (printer) => ({ printer }) },
    print: vi.fn(async (config, data) => wiring.printed.push({ config, data })),
  };
}

let client;
vi.mock('qz-tray', () => ({
  get default() {
    return client;
  },
}));

/** Resolves a qz-tray-style promise factory: `(resolve) => …` or `(data) => (resolve) => …`. */
const settle = (factory, arg) =>
  new Promise((resolve) => {
    const inner = arg === undefined ? factory : factory(arg);
    inner(resolve);
  });

const statusRoute = (engine) =>
  json(200, {
    data: { enabled: true, autoPrintReceipt: true, engine, connectorName: 'Al Nakheel Market' },
  });

let connector;

beforeEach(async () => {
  vi.resetModules();
  client = fakeClient();
  useAuthStore.setState({ status: 'authenticated', accessToken: 't', profile: { name: 'A' } });
  connector = await import('../printConnector');
});
afterEach(() => vi.unstubAllGlobals());

describe('printing through QZ Tray', () => {
  it('has the server sign every call, and never holds the key itself', async () => {
    const m = mockFetch({
      [STATUS]: statusRoute('qz'),
      [CERT]: new Response('-----BEGIN CERTIFICATE-----', { status: 200 }),
      [SIGN]: json(200, { data: { signature: 'sig-from-server' } }),
    });

    await connector.printRaw({ printer: 'EPSON TM-T20', data: 'AAA=' });

    expect(client.wiring.algorithm).toBe('SHA512');
    expect(await settle(client.wiring.certificate)).toContain('BEGIN CERTIFICATE');
    expect(await settle(client.wiring.signature, '{"call":"print"}')).toBe('sig-from-server');
    expect(JSON.parse(m.calls.find((c) => c.key === SIGN).init.body)).toEqual({
      data: '{"call":"print"}',
    });
    expect(client.print).toHaveBeenCalledWith({ printer: 'EPSON TM-T20' }, [
      { type: 'raw', format: 'base64', data: 'AAA=' },
    ]);
  });

  it('prints nothing rather than guessing when the server will not sign', async () => {
    mockFetch({
      [STATUS]: statusRoute('qz'),
      [CERT]: new Response('-----BEGIN CERTIFICATE-----', { status: 200 }),
      [SIGN]: json(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'not set up' } }),
    });
    await connector.printRaw({ printer: 'EPSON TM-T20', data: 'AAA=' });
    // An empty signature is what QZ Tray refuses; the browser never invents one.
    expect(await settle(client.wiring.signature, '{"call":"print"}')).toBe('');
  });
});

describe('printing through NanoPrint', () => {
  it('asks the server for no signature at all, and names the shop for the allow prompt', async () => {
    const m = mockFetch({ [STATUS]: statusRoute('nanoprint') });

    await connector.printRaw({ printer: 'EPSON TM-T20', data: 'AAA=' });

    // A signing promise is set, but it resolves empty without ever calling the server.
    expect(await settle(client.wiring.signature, '{"call":"print"}')).toBe('');
    expect(JSON.parse(await settle(client.wiring.certificate))).toEqual({
      nanoprint: { name: 'Al Nakheel Market' },
    });
    expect(m.count(SIGN)).toBe(0);
    expect(m.count(CERT)).toBe(0);
    // The bytes go out exactly as they do under QZ Tray.
    expect(client.print).toHaveBeenCalledWith({ printer: 'EPSON TM-T20' }, [
      { type: 'raw', format: 'base64', data: 'AAA=' },
    ]);
  });

  it('lists the same printers, so a profile means the same thing either way', async () => {
    mockFetch({ [STATUS]: statusRoute('nanoprint') });
    expect(await connector.listPrinters()).toEqual(['EPSON TM-T20', 'Zebra ZD220']);
  });
});

describe('switching agent in Settings', () => {
  it('re-wires the client, so the next job goes out the new way', async () => {
    let engine = 'qz';
    const m = mockFetch({
      [STATUS]: () => statusRoute(engine),
      [CERT]: () => new Response('-----BEGIN CERTIFICATE-----', { status: 200 }),
      [SIGN]: () => json(200, { data: { signature: 'sig-from-server' } }),
    });

    await connector.printRaw({ printer: 'EPSON TM-T20', data: 'AAA=' });
    expect(await settle(client.wiring.signature, '{"call":"print"}')).toBe('sig-from-server');

    engine = 'nanoprint';
    await connector.printRaw({ printer: 'EPSON TM-T20', data: 'AAA=' });
    expect(JSON.parse(await settle(client.wiring.certificate)).nanoprint.name).toBe(
      'Al Nakheel Market',
    );
    // The signing promise is replaced, so no job asks the server to sign for NanoPrint.
    const signsBefore = m.count(SIGN);
    expect(await settle(client.wiring.signature, '{"call":"print"}')).toBe('');
    expect(m.count(SIGN)).toBe(signsBefore);
  });
});
