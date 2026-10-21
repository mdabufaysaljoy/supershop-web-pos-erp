import { api, apiData } from '@/lib/apiClient';

/**
 * QZ Tray (P6.3): the little program on the cashier's machine that talks to the printers a
 * browser cannot reach. It only obeys calls signed by the shop's own private key — which lives on
 * the API, never here — so this module asks the server for the certificate and for a signature
 * per call, and holds nothing secret itself.
 *
 * Loaded on demand: a shop that does not print never downloads it.
 */
let qz = null;
let connecting = null;

async function load() {
  if (qz) return qz;
  const mod = await import('qz-tray');
  qz = mod.default ?? mod;
  qz.security.setCertificatePromise((resolve) => {
    api('/api/v1/printing/certificate', { responseType: 'text' })
      .then(resolve)
      .catch(() => resolve());
  });
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((data) => (resolve) => {
    apiData('/api/v1/printing/sign', { method: 'POST', body: { data } })
      .then((result) => resolve(result.signature))
      .catch(() => resolve(''));
  });
  return qz;
}

/** Connects if it is not connected already; several callers share the one attempt. */
export async function connect() {
  const tray = await load();
  if (tray.websocket.isActive()) return tray;
  connecting ??= tray.websocket.connect({ retries: 1, delay: 1 }).finally(() => {
    connecting = null;
  });
  await connecting;
  return tray;
}

export const isConnected = () => Boolean(qz?.websocket?.isActive());

/** The printers this machine has, as QZ Tray names them (the shop picks one per profile). */
export async function listPrinters() {
  const tray = await connect();
  return tray.printers.find();
}

/**
 * Sends raw ESC/POS bytes to a printer. The bytes were built by the API — the browser decides
 * nothing about what a receipt says, only where it comes out.
 * @param {{ printer: string, data: string }} job  `data` is base64
 */
export async function printRaw({ printer, data }) {
  const tray = await connect();
  const config = tray.configs.create(printer);
  await tray.print(config, [{ type: 'raw', format: 'base64', data }]);
}

/** Closes the connection — used when the admin signs out. */
export async function disconnect() {
  if (qz?.websocket?.isActive()) await qz.websocket.disconnect();
}
