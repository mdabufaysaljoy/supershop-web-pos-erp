/** Alerts module — the bell in the admin. Public API. */
export { createAlertRouter } from './alert.routes.js';
export { registerAlertSubscribers } from './alert.events.js';
export { raiseAlert, setAllPermissions } from './alert.service.js';
export { Alert } from './alert.model.js';
