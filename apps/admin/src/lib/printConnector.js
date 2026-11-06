import { api, apiData } from '@/lib/apiClient';

/**
 * The local print agent (P6.3): the little program on the cashier's machine that talks to the
 * printers a browser cannot reach. The shop picks one in Settings → Printing, and both speak the
 * same wire protocol — the `qz-tray` client drives either — so everything above this file is the
 * same whichever is installed:
 *
 *  - **QZ Tray** only obeys calls signed by the shop's own private key. That key lives on the API
 *    and never here, so this module asks the server for the certificate and for a signature per
 *    call, and holds nothing secret itself.
 *  - **NanoPrint** signs nothing. It asks the cashier to allow this site once and remembers the
 *    answer, so there are no keys to set up; the only thing it wants from the server is the shop's
 *    name, which it shows in that prompt.
 *
 * Loaded on demand: a shop that does not print never downloads the client.
 */
let client = null;
let connecting = null;
/** The engine the loaded client was wired for, so a change in Settings takes effect. */
let wiredFor = null;

/** Which agent this shop prints through, and what to call it in NanoPrint's prompt. */
async function engineStatus() {
  const status = await apiData('/api/v1/printing/status');
  return {
    engine: status?.engine === 'nanoprint' ? 'nanoprint' : 'qz',
    name: status?.connectorName,
  };
}

async function load() {
  const { engine, name } = await engineStatus();
  if (client && wiredFor === engine) return client;

  if (!client) {
    const mod = await import('qz-tray');
    client = mod.default ?? mod;
  }

  if (engine === 'nanoprint') {
    // NanoPrint reads this call only for the name on its permission prompt.
    client.security.setCertificatePromise((resolve) =>
      resolve(JSON.stringify({ nanoprint: { name: name || 'Supershop' } })),
    );
    // It accepts and ignores signatures, so nothing is asked of the API's key. Set explicitly
    // rather than left alone: a shop that switched away from QZ Tray would otherwise keep asking
    // the server to sign jobs that nobody checks.
    client.security.setSignaturePromise(() => (resolve) => resolve(''));
  } else {
    client.security.setCertificatePromise((resolve) => {
      api('/api/v1/printing/certificate', { responseType: 'text' })
        .then(resolve)
        .catch(() => resolve());
    });
    client.security.setSignatureAlgorithm('SHA512');
    client.security.setSignaturePromise((data) => (resolve) => {
      apiData('/api/v1/printing/sign', { method: 'POST', body: { data } })
        .then((result) => resolve(result.signature))
        .catch(() => resolve(''));
    });
  }

  wiredFor = engine;
  return client;
}

/**
 * Connects if it is not connected already; several callers share the one attempt. Both agents
 * listen on the same local ports, so the client finds whichever one is running.
 */
export async function connect() {
  const agent = await load();
  if (agent.websocket.isActive()) return agent;
  connecting ??= agent.websocket.connect({ retries: 1, delay: 1 }).finally(() => {
    connecting = null;
  });
  await connecting;
  return agent;
}

export const isConnected = () => Boolean(client?.websocket?.isActive());

/** The printers this machine has, as the agent names them (the shop picks one per profile). */
export async function listPrinters() {
  const agent = await connect();
  return agent.printers.find();
}

/**
 * Sends raw ESC/POS bytes to a printer. The bytes were built by the API — the browser decides
 * nothing about what a receipt says, only where it comes out.
 * @param {{ printer: string, data: string }} job  `data` is base64
 */
export async function printRaw({ printer, data }) {
  const agent = await connect();
  const config = agent.configs.create(printer);
  await agent.print(config, [{ type: 'raw', format: 'base64', data }]);
}

/** Closes the connection — used when the admin signs out, or when the shop switches agent. */
export async function disconnect() {
  if (client?.websocket?.isActive()) await client.websocket.disconnect();
  wiredFor = null;
}
