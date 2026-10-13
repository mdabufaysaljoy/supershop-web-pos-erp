import { sendData } from '../../core/http.js';
import { listAuditEntries } from './audit.service.js';

export async function list(req, res) {
  const { items, meta } = await listAuditEntries(req.valid.query);
  sendData(res, items, { meta });
}
