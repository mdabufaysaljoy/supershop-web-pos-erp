/**
 * Auth event subscribers.
 *
 * The account emails (verify, reset) are sent by the notifications module (P4.5), which subscribes
 * to the same events and renders the shop's own templates. Nothing is logged here any more: with
 * the default `log` email provider the whole message — link included — appears in the application
 * log, which is what local development needs, and a configured shop sends it for real.
 */
export function registerAuthSubscribers() {}
