import { z } from 'zod';
import { DEFAULTS } from '../constants.js';
import { PERMISSIONS as P } from '../permissions.js';
import { V } from '../validators/messages.js';
import { email, plainText } from '../validators/fields.js';

/**
 * Settings registry (CLAUDE.md §2.4): every admin-editable behavior is a typed key with a zod
 * schema, a default, a group (admin tab) and flags. Shared so admin forms validate with the exact
 * schema the API enforces. Adding a setting = add a definition here (or register a server-only one
 * from an API module). Never rename keys (stored in DB); deprecate instead.
 *
 * Flags:
 * - `public`: readable without auth via GET /settings/public (storefront needs it). Never for secrets.
 * - `secret`: stored encrypted, never returned (only masked), read server-side via getSecret().
 *
 * @typedef {object} SettingDefinition
 * @property {string} key
 * @property {keyof typeof SETTING_GROUPS} group
 * @property {import('zod').ZodType} schema
 * @property {unknown} default
 * @property {boolean} [public]
 * @property {boolean} [secret]
 */

/** Admin tabs → permission required to EDIT that group (reading requires `settings.view`). */
export const SETTING_GROUPS = Object.freeze({
  general: P.SETTINGS_GENERAL,
  tax: P.SETTINGS_GENERAL,
  features: P.SETTINGS_GENERAL,
  customers: P.SETTINGS_GENERAL,
  checkout: P.SETTINGS_CHECKOUT,
  payments: P.SETTINGS_PAYMENTS,
  notifications: P.SETTINGS_NOTIFICATIONS,
  printing: P.SETTINGS_PRINTING,
  languages: P.SETTINGS_LANGUAGES,
  security: P.SETTINGS_SECURITY,
});

const int = (min, max) =>
  z
    .number({ error: V.INVALID_TYPE })
    .int({ error: V.INVALID_TYPE })
    .min(min, { error: V.TOO_SHORT })
    .max(max, { error: V.TOO_LONG });
const bool = () => z.boolean({ error: V.INVALID_TYPE });

const timeZone = z.string({ error: V.INVALID_TYPE }).refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { error: V.INVALID_TYPE },
);

const passwordPolicy = z
  .object({
    minLength: int(8, 128),
    requireLower: bool(),
    requireUpper: bool(),
    requireDigit: bool(),
    requireSymbol: bool(),
  })
  .strict();

/** @type {SettingDefinition[]} */
const DEFINITIONS = [
  // ---------- general ----------
  {
    key: 'store.name',
    group: 'general',
    schema: plainText({ min: 1, max: 100 }),
    default: 'Supershop',
    public: true,
  },
  {
    key: 'store.timeZone',
    group: 'general',
    schema: timeZone,
    default: DEFAULTS.timeZone,
    public: true,
  },
  {
    key: 'store.currency',
    group: 'general',
    schema: z.enum(['SAR'], { error: V.INVALID_TYPE }),
    default: DEFAULTS.currency,
    public: true,
  },
  {
    key: 'store.countryCode',
    group: 'general',
    schema: z.string().regex(/^[A-Z]{2}$/, { error: V.INVALID_TYPE }),
    default: DEFAULTS.countryCode,
    public: true,
  },
  {
    key: 'store.weekendDays',
    group: 'general',
    schema: z
      .array(int(0, 6))
      .max(3, { error: V.TOO_LONG })
      .transform((d) => [...new Set(d)].sort()),
    default: [...DEFAULTS.weekendDays],
    public: true,
  },
  {
    key: 'store.calendarDisplay',
    group: 'general',
    schema: z.enum(['gregorian', 'hijri', 'both'], { error: V.INVALID_TYPE }),
    default: 'gregorian',
    public: true,
  },

  // ---------- tax ----------
  {
    key: 'tax.vatRateBps',
    group: 'tax',
    schema: int(0, 10_000),
    default: DEFAULTS.vatRateBps,
    public: true,
  },
  {
    key: 'tax.pricesIncludeVat',
    group: 'tax',
    schema: bool(),
    default: DEFAULTS.pricesIncludeVat,
    public: true,
  },
  {
    // Saudi VAT registration number: 15 digits, starts and ends with 3 (ZATCA).
    key: 'tax.vatNumber',
    group: 'tax',
    schema: z
      .string()
      .regex(/^3\d{13}3$/, { error: V.CODE_INVALID })
      .nullable(),
    default: null,
  },

  // ---------- features (flags checked in module index.js) ----------
  {
    key: 'features.customerAccounts',
    group: 'features',
    schema: bool(),
    default: true,
    public: true,
  },
  { key: 'features.guestCheckout', group: 'features', schema: bool(), default: true, public: true },
  { key: 'features.loyalty', group: 'features', schema: bool(), default: true, public: true },
  { key: 'features.sms', group: 'features', schema: bool(), default: false, public: true },

  // ---------- customers / cart ----------
  {
    key: 'customers.allowInternationalPhone',
    group: 'customers',
    schema: bool(),
    default: false,
    public: true,
  },
  // ---------- notifications (P4.5) ----------
  // What the shop may send, and through what. Providers are adapters: switching one is a setting.
  { key: 'notifications.email', group: 'notifications', schema: bool(), default: true },
  { key: 'notifications.sms', group: 'notifications', schema: bool(), default: false },
  {
    key: 'notifications.emailProvider',
    group: 'notifications',
    schema: z.enum(['log', 'smtp'], { error: V.INVALID_TYPE }),
    /** `log` writes the message to the application log: a new shop never silently drops mail. */
    default: 'log',
  },
  {
    key: 'notifications.emailFrom',
    group: 'notifications',
    schema: z.union([z.literal(''), email]),
    default: '',
  },
  {
    key: 'notifications.emailFromName',
    group: 'notifications',
    schema: plainText({ max: 60 }),
    default: '',
  },
  {
    key: 'notifications.smtpHost',
    group: 'notifications',
    schema: plainText({ max: 120 }),
    default: '',
  },
  { key: 'notifications.smtpPort', group: 'notifications', schema: int(1, 65535), default: 587 },
  { key: 'notifications.smtpSecure', group: 'notifications', schema: bool(), default: false },
  {
    key: 'notifications.smtpUser',
    group: 'notifications',
    schema: plainText({ max: 120 }),
    default: '',
  },
  {
    key: 'notifications.smtpPassword',
    group: 'notifications',
    schema: z.string({ error: V.INVALID_TYPE }).trim().max(255),
    default: '',
    secret: true,
  },
  {
    key: 'notifications.smsProvider',
    group: 'notifications',
    schema: z.enum(['log', 'unifonic', 'taqnyat'], { error: V.INVALID_TYPE }),
    default: 'log',
  },
  /** The name or short code the message comes from (the provider registers it). */
  {
    key: 'notifications.smsSender',
    group: 'notifications',
    schema: plainText({ max: 11 }),
    default: '',
  },
  {
    key: 'notifications.smsApiKey',
    group: 'notifications',
    schema: z.string({ error: V.INVALID_TYPE }).trim().max(255),
    default: '',
    secret: true,
  },

  // ---------- payments (P4.1) ----------
  // WHICH methods a shop offers is admin data (the payment_methods collection, P4.2). What stays
  // here is the gateway behind the "card" method and its keys, reached through an adapter.
  {
    key: 'payments.gateway',
    group: 'payments',
    schema: z.enum(['none', 'moyasar'], { error: V.INVALID_TYPE }),
    default: 'none',
  },
  {
    key: 'payments.moyasar.secretKey',
    group: 'payments',
    schema: z.string({ error: V.INVALID_TYPE }).trim().max(255),
    default: '',
    secret: true,
  },
  /** The token the gateway sends back with every webhook (set the same value in its dashboard). */
  {
    key: 'payments.moyasar.webhookSecret',
    group: 'payments',
    schema: z.string({ error: V.INVALID_TYPE }).trim().max(255),
    default: '',
    secret: true,
  },

  // ---------- customer sign-in with Google (P3.5) ----------
  // Credentials come from the Google Cloud console; the storefront only learns whether the button
  // should be shown. Turning this off takes the button away and refuses the routes.
  {
    key: 'auth.google.enabled',
    group: 'customers',
    schema: bool(),
    default: false,
    public: true,
  },
  {
    key: 'auth.google.clientId',
    group: 'customers',
    schema: z.string({ error: V.INVALID_TYPE }).trim().max(255),
    default: '',
  },
  {
    key: 'auth.google.clientSecret',
    group: 'customers',
    schema: z.string({ error: V.INVALID_TYPE }).trim().max(255),
    default: '',
    secret: true,
  },
  {
    key: 'cart.maxLineQty',
    group: 'checkout',
    schema: int(1, 100_000),
    default: DEFAULTS.maxCartQty,
    public: true,
  },

  // ---------- media uploads (P1.1) ----------
  // Hard safety ceilings (pixel count, accepted types) are fixed server-side; these are the knobs.
  { key: 'media.maxUploadMb', group: 'general', schema: int(1, 50), default: 10 },
  /** Longest side of the stored full-size image; larger uploads are scaled down. */
  { key: 'media.maxDimension', group: 'general', schema: int(800, 6000), default: 2560 },
  /** WebP quality for re-encoded images (higher = sharper + bigger files). */
  { key: 'media.webpQuality', group: 'general', schema: int(50, 95), default: 82 },

  // ---------- barcodes (P1.6) ----------
  /**
   * GS1 "restricted circulation" prefix (20–29) for EAN-13 codes the store prints itself. Pick one
   * not used by any scale/label system in the store. Real GS1 company prefixes come from suppliers.
   */
  {
    key: 'barcode.internalPrefix',
    group: 'general',
    schema: z.enum(['20', '21', '22', '23', '24', '25', '26', '27', '28', '29'], {
      error: V.INVALID_TYPE,
    }),
    default: '20',
  },

  // ---------- inventory (P2.2) ----------
  /** Low-stock alert level for branches/variants without their own threshold; 0 = alert only when out. */
  { key: 'inventory.lowStockThreshold', group: 'general', schema: int(0, 1_000_000), default: 5 },

  // ---------- checkout / delivery (P3.4) ----------
  /** Flat delivery fee in halalas (0 = free). Zones/couriers come with shipping (P4.3). */
  {
    key: 'checkout.deliveryFee',
    group: 'checkout',
    schema: int(0, 100_000_000),
    default: 0,
    public: true,
  },
  /** Order value (halalas) from which delivery is free; 0 = never free automatically. */
  {
    key: 'checkout.freeDeliveryOver',
    group: 'checkout',
    schema: int(0, 100_000_000),
    default: 0,
    public: true,
  },
  /** Delivery is taxed like products (same VAT rate); false = delivery is not taxed. */
  { key: 'checkout.taxDelivery', group: 'checkout', schema: bool(), default: true, public: true },

  // ---------- purchasing (P2.3) ----------
  /** Variant cost after a purchase-order receipt: keep, last received cost, or weighted average. */
  {
    key: 'purchase.costMethod',
    group: 'general',
    schema: z.enum(['none', 'last', 'average'], { error: V.INVALID_TYPE }),
    default: 'average',
  },

  // ---------- languages / translation (CLAUDE.md §5.7) ----------
  {
    // 'noop' = automatic translation off (Arabic falls back to English). 'libretranslate' = the
    // self-hosted container (`docker compose --profile translation up -d`).
    key: 'i18n.provider',
    group: 'languages',
    schema: z.enum(['noop', 'libretranslate'], { error: V.INVALID_TYPE }),
    default: 'noop',
  },
  {
    key: 'i18n.libretranslateUrl',
    group: 'languages',
    schema: z.url({ protocol: /^https?$/, error: V.URL_INVALID }).max(2048),
    default: 'http://localhost:5000',
  },
  // Arabic UI digits: Western 0-9 (default, common on Saudi e-commerce) or Arabic-Indic ٠-٩.
  {
    key: 'i18n.digitStyle',
    group: 'languages',
    schema: z.enum(['latn', 'arab'], { error: V.INVALID_TYPE }),
    default: 'latn',
    public: true,
  },
  // Redirect first-time visitors to Arabic when their browser prefers it (never bots). Off by default.
  { key: 'i18n.autoDetect', group: 'languages', schema: bool(), default: false, public: true },
  // Characters sent to the provider per calendar month; 0 = unlimited (self-hosted has no per-char cost).
  { key: 'i18n.monthlyCharBudget', group: 'languages', schema: int(0, 1_000_000_000), default: 0 },

  // ---------- security ----------
  {
    key: 'security.passwordPolicy',
    group: 'security',
    schema: passwordPolicy,
    default: {
      minLength: 10,
      requireLower: true,
      requireUpper: false,
      requireDigit: true,
      requireSymbol: false,
    },
    public: true, // registration forms need it for client-side validation
  },
  { key: 'security.lockoutMaxAttempts', group: 'security', schema: int(3, 20), default: 5 },
  { key: 'security.lockoutMinutes', group: 'security', schema: int(1, 1440), default: 15 },
  { key: 'security.staffSessionIdleHours', group: 'security', schema: int(1, 168), default: 12 },
  { key: 'security.staffSessionMaxDays', group: 'security', schema: int(1, 90), default: 7 },
  { key: 'security.customerSessionIdleDays', group: 'security', schema: int(1, 365), default: 30 },
  { key: 'security.customerSessionMaxDays', group: 'security', schema: int(1, 365), default: 90 },
];

for (const d of DEFINITIONS) {
  if (d.public && d.secret) throw new Error(`Setting ${d.key} cannot be both public and secret`);
  if (!(d.group in SETTING_GROUPS))
    throw new Error(`Setting ${d.key} has unknown group ${d.group}`);
  if (!d.schema.safeParse(d.default).success)
    throw new Error(`Setting ${d.key}: default fails its schema`);
}

export const SETTINGS = Object.freeze(DEFINITIONS.map((d) => Object.freeze(d)));
