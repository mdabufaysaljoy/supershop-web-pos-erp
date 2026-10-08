# CLAUDE.md — Multi-Category E-commerce + ERP/POS (Saudi Arabia)

> Read this file + `PROGRESS.md` at session start. Do NOT read the whole repo. Work on ONE task (e.g. `P3.4`) per session, then update `PROGRESS.md` and commit.
> Requirements WILL change. Obey the "Change-Safety Rules" (section 3) so changes stay cheap.

---

## 0. Agent Working Rules (token efficiency — all models)

1. Start: read `CLAUDE.md`, `PROGRESS.md`. Then only the files the current task touches (grep/glob first, read ranges, not whole files).
2. Do exactly one task ID from the current phase. Do not start the next task, do not "also improve" unrelated code.
3. Don't re-read files already in context. Batch edits. Don't print code back in chat — write it to files.
4. Final reply max 5 lines: what changed, how to verify, next task ID. No long explanations, no summaries of the plan.
5. Don't create extra docs/README/markdown unless the task says so. Exception: update `PROGRESS.md` (always).
6. Ambiguity: pick the most conservative default, record it in `PROGRESS.md > Decisions`, continue. Ask the user only for blockers (missing keys, business rules that change data model).
7. Run lint + related tests before finishing. Fix failures; don't leave red.
8. Commit per task: `feat(P3.4): short message` (conventional commits).
9. Never invent library APIs. If unsure of a package API, check its installed `node_modules` types/README quickly or use docs lookup.
10. Never commit secrets. Use `.env` + `.env.example` (keep example in sync).
11. All user-visible text: write ENGLISH ONLY via `t('key')` or localized fields. Never hardcode strings, never hand-write Arabic — Arabic is auto-generated (see 5.7).

---

## 1. Product Summary

Single-vendor, multi-category e-commerce (gadgets, clothing, supermarket items; NO food prep/restaurant) for Saudi visitors (English source language + header EN/AR switcher with fully automatic Arabic translation and RTL, see 5.7) + an ERP/POS admin panel with full CMS and page builder. Admin controls everything: pages, sections, carousels, ordering, SEO, tracking, checkout fields, payment methods, receipts, printers, loyalty, branches, staff, roles.

**Stack:** MERN, JavaScript (no TypeScript; use JSDoc where types help), Tailwind + shadcn/ui (Radix). Any extra library allowed if it earns its place.

**Priority order of quality attributes:** Security > Correctness of money/stock > Role-based access > Input validation > SEO > Marketing tracking > Page-builder power > Saudi localization > Visual polish.

---

## 2. Architecture

### 2.1 Style: Modular Monolith (monorepo, npm workspaces)

```
/
├─ apps/
│  ├─ api/            Express + Mongoose (REST, /api/v1)
│  ├─ storefront/     Next.js (JS) — SSR/ISR for SEO. Customer site.
│  └─ admin/          Vite + React SPA — CMS, builder, ERP, POS
├─ packages/
│  ├─ shared/         zod schemas, constants, permission keys, money/format utils, i18n keys, event names
│  └─ ui/             shared React components (inputs, tables, builder block renderers)
├─ docker/ , .github/ , docs/ (only ADRs)
├─ CLAUDE.md  PROGRESS.md  AGENTS.md
```

> Decision D-001: Next.js for storefront because Google ranking needs server-rendered HTML + metadata + JSON-LD + sitemap. Admin stays a Vite SPA (no SEO need). Changeable via ADR if requirements change; keep the storefront data access behind `packages/shared` API client so a swap is contained.

### 2.2 Backend layering (per feature module)

```
apps/api/src/
├─ core/            config, db, logger, errors, http (envelope), events (bus), queue (BullMQ), crypto
├─ middleware/      auth, rbac, validate(zod), rateLimit, idempotency, upload, audit
├─ adapters/        payments/ sms/ email/ storage/ tracking/ translation/ printing-meta/  (interface + 1..n implementations)
├─ modules/<feature>/
│   ├─ <feature>.model.js      mongoose schema only
│   ├─ <feature>.repo.js       ONLY place that touches the model
│   ├─ <feature>.service.js    business logic, transactions, emits events
│   ├─ <feature>.controller.js thin: parse → service → respond
│   ├─ <feature>.routes.js     route + permission + validation wiring
│   ├─ <feature>.events.js     subscribers (side-effects)
│   ├─ index.js                PUBLIC API of the module (what others may import)
│   └─ __tests__/
└─ app.js / server.js
```

**Dependency rules (enforced by eslint `no-restricted-imports` + review):**
- Controller → Service → Repo → Model. Never skip a layer.
- A module may import another module's `index.js` only. Never its model/repo.
- Cross-module side effects go through the **event bus** (e.g. `order.paid` → loyalty earn, inventory deduct, tracking purchase, email receipt). Services don't call unrelated modules directly.
- Third-party integrations only via `adapters/` interfaces. Business code never imports a gateway SDK.

### 2.3 Frontend structure

```
apps/admin/src/  &  apps/storefront/
├─ features/<feature>/{api.js, hooks.js, components/, pages/, schema.js}
├─ components/ui/        shadcn primitives
├─ components/fields/    EmailInput PhoneInput NameInput MoneyInput QtyInput ... (see 5.3)
├─ lib/                  apiClient, queryClient, i18n, permissions (can())
└─ routes/
```
- Server state: TanStack Query. Local/UI state: Zustand (small stores). Forms: react-hook-form + zod resolver using schemas from `packages/shared`.
- Admin UI gates by `can('perm.key')`; hide + server-enforce (server is the source of truth).

### 2.4 Key patterns that make requirements-change cheap

| Need | Pattern |
|---|---|
| Swap payment/SMS/email/storage vendor | **Adapter + registry** (`adapters/<kind>/index.js` picks by settings) |
| Add a side-effect to an action | **Event subscriber**, don't edit the service |
| New permission/role | **Permission registry** in `packages/shared/permissions.js`; roles are DB data (permission-string arrays) |
| Admin-editable behavior | **Settings registry**: key → zod schema + default + group/tab; typed accessor `settings.get('loyalty.earnRate')`, cached, audited |
| New page/section type | **Block registry** (schema + renderer + editor panel) — no router/code change |
| Extra checkout/product/customer fields | **Custom field definitions** (type, validation, visibility, entity) stored in DB, rendered dynamically |
| Order/return lifecycle changes | **State machine config** (states, transitions, guards, events) in one file per aggregate |
| Business rules (loyalty, VAT, discounts, shipping) | **Rule/strategy objects** selected by settings; no `if(country)` scattered |
| Multi-language | `LocalizedString` fields + translation adapter + auto-translate on save (5.7); UI strings via keys with generated `ar.json`; logical CSS (`ms-`, `me-`, `ps-`) for RTL; a language is config (add one = settings + glossary, no code) |
| Branch-aware data | Every stock/sale/shift/report record carries `branchId`; queries go through scope helper |
| Feature on/off | `settings` feature flags (`features.loyalty`, `features.sms`) checked in module `index.js` |

### 2.5 Cross-cutting conventions

- **API:** `/api/v1/...`; success `{ data, meta? }`; error `{ error: { code, message, details? } }` (stable machine `code`s, i18n-able). Pagination `?page&limit&sort`, filters via whitelist only.
- **Money:** integers in minor units (halalas). Currency `SAR`. Helpers in `shared/money`. VAT 15% configurable; prices shown VAT-inclusive by default (setting). Never use floats for money.
- **IDs/Time:** Mongo ObjectId; all timestamps UTC in DB, display `Asia/Riyadh` (configurable). Dates in API are ISO strings.
- **Snapshots:** Orders/receipts store a snapshot of product name, price, tax, variant — never rely on live catalog for history.
- **Soft delete** for catalog/customers/staff (`deletedAt`); hard delete never for financial records.
- **Audit log:** who/when/what/before/after for settings, price, stock adjust, role, refund, login events.
- **Idempotency:** `Idempotency-Key` on checkout, POS sale, payment webhook, return/exchange.
- **Transactions:** Mongo sessions for multi-document money/stock changes (needs replica set; dev docker uses single-node replset).
- **Stock = append-only ledger** (`stockMovements`: sale, return, adjust, transfer, receive). Quantity on hand is derived/cached by atomic `$inc` + ledger row in the same transaction. Never edit quantity directly.
- **Logging:** pino, request-id, no PII/secrets in logs.
- **Jobs (BullMQ + Redis):** email, SMS, tracking dispatch, webhooks retry, report snapshots, exports, imports.

---

## 3. Change-Safety Rules (read before every task)

1. New requirement → first ask: can it be a **setting, custom field, block, adapter, rule, or event subscriber**? Prefer that over editing core services.
2. Don't hardcode: tax rate, currency, earn rate, receipt layout, label sizes, checkout fields, order states, payment methods, SEO defaults. All live in settings/DB.
3. Don't leak vendor names into business code or DB field names (`gatewayRef`, not `moyasarId`).
4. DB changes: additive only (new optional fields, new collections). Breaking change = migration script in `apps/api/migrations/` + note in PROGRESS.md.
5. Shared contracts (zod schemas, permission keys, event names, error codes) live in `packages/shared` — change them in ONE place.
6. Record each requirement change in `PROGRESS.md > Change Log` (date, what, impacted modules, tasks added/removed). Update this file only if architecture rules change.
7. Keep functions small and pure where possible (pricing, loyalty, tax, exchange difference) — these get unit tests.
8. New user-visible text? Use `t()` or a `LocalizedString`/`translatable` prop — auto-translation covers it. Adding a language = a `Language` config + glossary, not code.

---

## 4. Domain Model (core collections)

`User(staff/customer roles separate)`, `Customer`, `Role`, `Branch`, `Category(tree: parentId, path)`, `Brand`, `Supplier`, `Product`, `Variant(sku, barcode, attributes, images, price, cost)`, `StockLevel(variantId, branchId, qty)`, `StockMovement`, `Cart`, `Order(channel: online|pos, branchId?)`, `OrderItem`, `Payment(method, status, gatewayRef, amount)`, `Shipment/Tracking`, `Shift`, `ZReport`, `ReturnExchange`, `LoyaltyAccount`, `LoyaltyLedger`, `Campaign`, `Page(blocks JSON, status, versions)`, `Menu`, `Media`, `Setting`, `CustomFieldDef`, `PaymentMethod(custom)`, `PrinterProfile`, `ReceiptTemplate`, `LabelTemplate`, `TrackingIntegration`, `AuditLog`, `Counter`(sequence numbers for order/receipt/invoice), `Language`(config), `Translation`(cache), `GlossaryTerm`, `TranslationJob`.

Order lifecycle (config-driven): `pending → paid|cod_confirmed → processing → shipped → delivered → completed`; branches: `cancelled`, `refunded`, `partially_returned`, `exchanged`. POS orders are created `paid → completed` in one transaction.

---

## 5. Cross-Cutting Requirements (apply in EVERY phase)

### 5.1 Security (OWASP-driven)
- Passwords: argon2id (or bcrypt cost ≥12). Min length + breached-pattern check optional.
- Auth: short-lived JWT access token + rotating refresh token in httpOnly+Secure+SameSite cookie; refresh reuse detection; logout invalidates. Admin: optional TOTP 2FA (Phase 10 at latest). Account lockout/backoff on repeated failure.
- CSRF protection for cookie-authenticated mutations (double-submit or SameSite+origin check).
- `helmet`, strict CORS allowlist, rate limits (global + stricter on auth/OTP/checkout/search), body size limits.
- Sanitize: `express-mongo-sanitize`, no `$`/`.` keys; whitelist query operators; escape/sanitize rich text (DOMPurify server-side for builder HTML/CMS).
- File uploads: type sniffing (magic bytes), size limits, random filenames, image re-encode (sharp), no executable serving, storage via adapter (local → S3-compatible).
- Secrets (gateway keys, SMS tokens, CAPI tokens) encrypted at rest (AES-256-GCM with env master key); never returned to client in full (masked).
- Webhooks: verify signatures, replay protection, idempotency.
- QZ Tray: signed messages (certificate + private key signing endpoint on API, admin-only), not unsigned/anonymous.
- Authorization on EVERY route: `requirePermission('x.y')` + branch scope. Deny by default. Tests assert 401/403 paths.
- PII minimization; PDPL (Saudi) consent for marketing/tracking; data export/delete request support for customers (Phase 10).
- Dependency audit in CI (`npm audit`), lockfile committed.

### 5.2 RBAC
- Permission keys `resource.action` (e.g. `product.create`, `order.refund`, `pos.sell`, `report.view`, `settings.payments`, `staff.manage`).
- Roles = named sets of permissions (+ optional branch scope list). Super-admin bypass is explicit and audited. Users can have 1 role (v1) — structure allows multiple.
- Field-level hiding for sensitive data (cost price, profit) via permission `product.viewCost`.

### 5.3 Input Validation (strict by field type — server AND client, same zod schema)
Define once in `packages/shared/validators`, use in API validate middleware + forms + input components.
| Field | Rule |
|---|---|
| name | Unicode letters (Latin + Arabic), spaces, `'` `-` `.`; no digits/symbols; trimmed; 2–60 chars |
| email | RFC-reasonable email only, lowercase, max 254, optional MX/format check |
| phone (KSA) | digits only; normalize to `+9665XXXXXXXX` (accept `05XXXXXXXX`, `5XXXXXXXX`, `+9665…`); no decimals/letters/spaces after normalization; config to allow intl |
| money | positive integer minor units on API; UI decimal input max 2dp |
| quantity | positive integer; max configurable |
| address | free text with length limit, no HTML |
| password | min length + complexity per settings |
| barcode/SKU | allowed charset `[A-Z0-9-_.]`, length limits, unique |
| URL/slug | slug `[a-z0-9-]` (and Arabic slugs optional), unique |
- Input components (`EmailInput`, `PhoneInput`, `NameInput`, `MoneyInput`, `QtyInput`, …) block invalid characters at keystroke (`beforeinput`/paste sanitize) AND show validation messages. Right `inputMode`/`autocomplete`/`type`.
- Every API endpoint validates body, params, query via zod; unknown keys stripped; errors return field-level `details`.
- Custom checkout fields use the same validator types.
- Digits: numeric inputs accept Arabic-Indic digits (٠-٩) and normalize to ASCII before validation/storage (needed once the site is in Arabic).

### 5.4 SEO (storefront)
SSR/ISR pages; per-page title/description/canonical/OG/Twitter; JSON-LD (`Product`, `Offer`, `BreadcrumbList`, `Organization`, `WebSite` + SearchAction); dynamic `sitemap.xml` + `robots.txt` (admin editable); clean slugs, redirects manager (301), hreflang `en`/`ar`/`x-default` on every page + `/ar/...` URLs + per-language sitemap entries (5.7), image `alt` + `next/image`/WebP/AVIF + lazy; Core Web Vitals budgets (LCP < 2.5s); admin-editable site title/logo/favicon/meta defaults/schema data; 404/410 handling; no duplicate content via canonical on filtered/paginated lists.

### 5.5 Marketing Tracking
- One `tracking` module + `TrackingIntegration` admin UI: admin pastes IDs/tokens (GTM container, server-GTM URL, GA4 ID + API secret, Meta Pixel ID + CAPI token + test code, Google Ads conversion ID/label, TikTok/Snap optional), toggles events. No code edits needed.
- Standard event dictionary in `packages/shared/trackingEvents.js`: `page_view, view_item_list, view_item, search, add_to_cart, remove_from_cart, view_cart, begin_checkout, add_shipping_info, add_payment_info, purchase, refund, sign_up, login, generate_lead`.
- Client pushes to `dataLayer` (GTM) with a generated `event_id`; server sends the same event (+ `event_id` for dedup) to GA4 Measurement Protocol, Meta Conversions API, Google Ads enhanced conversions via queue. Hash PII (SHA-256) per platform rules. Capture `fbp/fbc/gclid/ga client_id`, UTM params on first touch and attach to order.
- Consent banner (PDPL) gates client tags; server events respect stored consent.
- YouTube/Google Ads attribution via GA4/Google Ads link — document in admin help text.

### 5.6 Saudi Localization
SAR, VAT 15% (configurable), `Asia/Riyadh`, Hijri date optional display, `+966` phone, Arabic via automatic translation + RTL from day one (see 5.7), Saudi payment methods through gateway adapter (e.g. Mada, STC Pay, Apple Pay, cards, bank transfer; via a KSA gateway such as Moyasar/HyperPay/Tap/PayTabs — implement adapter for ONE first, interface fits others), COD, KSA SMS providers (e.g. Unifonic/Taqnyat) via SMS adapter. ZATCA: simplified tax invoice QR (TLV base64: seller name, VAT no., timestamp, total, VAT) on receipts/invoices (Phase 6); Phase-2 e-invoicing integration as an adapter stub, built later if required. Saudi National Address format as optional address fields. Weekend/work-days settings (Fri–Sat).

---

### 5.7 Internationalization & Auto-Translation (EN → AR, zero manual translation)

**Goal:** a language button in the storefront header. Visitor taps it → the whole site is Arabic (RTL) immediately. Admins and developers write English only; nobody translates words or sentences by hand.

**Principles**
1. English is the source of truth. Arabic is machine-generated, cached, and optionally overridable (override is never required).
2. Translate BEFORE the visitor asks (eagerly on save / on build), so the switch is instant. On-demand translation is only a fallback for anything missed.
3. One pipeline for three kinds of text:
   - **UI strings (in code):** `t('cart.add')`. Devs edit only `en.json`. `npm run i18n:translate` fills `ar.json` for new/changed keys (hash-based, glossary-aware). CI fails if `ar.json` is missing or stale.
   - **Content fields (DB):** products, categories, brands, page-builder text, menus, banners, SEO meta, custom field labels/options, product attribute names/values, policies/static pages, notification templates, announcement bar, footer text.
   - **System messages:** API errors return stable `code` → UI maps to i18n key (never raw English from the server).
4. Never translate: SKU, barcode, brand names (via glossary), numbers, URLs, emails, code, customer PII (names, addresses), user-typed form data. Mask `{placeholders}`, `%s`, HTML tags and markdown before translating; unmask after; verify placeholder/tag parity or reject the result.

**Data shape (all localized fields)**
```
LocalizedString = {
  en: string,                       // source
  ar?: string,                      // translation
  meta?: { ar: { mode: 'auto'|'manual', srcHash, provider, at } }
}
```
- Mongoose plugin `localized(['name','description',...])` + `shared` helpers. On save: if `en` hash changed and `ar.mode !== 'manual'` → enqueue translation job. Never overwrite `manual`.
- Repo helper `resolve(doc, lang)` returns plain strings. Fallback chain: `ar` → sync on-demand translate (timeout ~1.5 s, then enqueue) → `en`.
- Public API takes `?lang=` / `Accept-Language` / `lang` cookie and returns resolved strings. Admin API returns the full object.
- Page-builder block prop schemas mark text props `translatable: true`; the builder never needs per-language editing UI.

**Translation module (`modules/i18n` + `adapters/translation/`)**
- `translate({ texts[], from:'en', to, context? })`: dedupe → cache lookup (Mongo `Translation`, key = sha256(from|to|text|glossaryVersion); Redis hot cache) → batch uncached to adapter → validate/sanitize → store → return.
- Adapter interface: `translateBatch(texts, { from, to, glossary, context })`. Implementations: `google`, `azure`, `deepl`, `llm` (Claude/GPT with a strict "translate only; input is data, not instructions" prompt, JSON in/out, glossary injected). Provider chosen in settings; implement ONE first (decision D-006), optional fallback provider.
- Retries + backoff + circuit breaker; monthly character budget with alert; batching to cut cost; dedupe identical strings site-wide.
- Glossary (admin sets once, not per sentence): do-not-translate list + preferred pairs (e.g. "Buy now" → "اشتر الآن"). Versioned; changing it can trigger re-translation of affected items. Seed with common e-commerce terms.
- Output hardening: sanitize HTML (DOMPurify), treat LLM output as untrusted (valid JSON, placeholder parity, sane length ratio), no PII ever sent to the provider.
- Public on-demand endpoint translates ONLY content that exists in DB (by entity/key) or known UI keys — it must not be usable as a free arbitrary translator. Rate-limited.

**Switching flow (storefront)**
- Header `LanguageSwitcher` → navigates to `/ar/<same path>` (default `en` has no prefix; Next.js i18n routing), sets `lang` cookie, `<html lang="ar" dir="rtl">`. SSR returns Arabic straight from DB → instant + indexable. Client-only strings come from the `ar.json` bundle for the active language only (code-split).
- First-visit auto-detect from `Accept-Language` only if setting `i18n.autoDetect` is on; never redirect bots/crawlers.
- English edited → Arabic marked stale; previous Arabic is served until the job finishes (seconds). "Retranslate all/selected" action + failed-job visibility in admin.

**RTL & formatting**
- Logical CSS only (`ms-/me-/ps-/pe-`, `start/end`), mirror directional icons/carousels/steppers/breadcrumbs, builder blocks render correctly in both directions.
- Arabic font via `next/font` (e.g. IBM Plex Sans Arabic / Noto Kufi Arabic / Tajawal). Digit style setting (Western default / Arabic-Indic). Currency/number/date formatting via `Intl` with `ar-SA` (Gregorian default; Hijri optional). Slugs stay English by default.

**Admin: Settings → Languages tab**
Enabled languages (code, name, native name, `rtl` flag), default language, provider + encrypted API key, glossary, monthly budget + usage, "Retranslate all", queue/failed jobs, auto-detect toggle, digit style. Optional per-field "Edit Arabic" (shows auto text; editing locks `mode:'manual'`; "Revert to auto" available). Admin panel UI itself stays English in v1; the same infra can enable it later.

**Outgoing messages & receipts:** store `lang` on order/customer; email/SMS/notification templates render in that language from auto-translated templates. Receipt language setting: `en` | `ar` | `bilingual` (Arabic text is required on ZATCA tax invoices — verify before go-live).

**SEO:** self-referencing canonical per language, hreflang pairs + `x-default`, translated meta title/description/JSON-LD text, per-language sitemap.

**Acceptance (automated):** an E2E crawl of key `/ar/*` pages finds no untranslated English UI text except glossary-protected terms; switching language completes without a visible English flash on SSR pages.

---

## 6. Phases (each task = one agent session; IDs referenced in PROGRESS.md)

Legend: `[H]` = needs strongest reasoning model/high effort (security, money, ledger, architecture). `[M]` = mid/medium model is fine (CRUD, UI, wiring). Models can be swapped per task — specs here are model-agnostic.

### Phase 0 — Foundation
- P0.1 [H] Monorepo scaffold: npm workspaces, eslint (+import boundary rules), prettier, husky/lint-staged, vitest/jest, `.env.example`, docker-compose (mongo replset, redis), CI workflow.
- P0.2 [H] `api/core`: config (zod-validated env), db connect, pino logger, error classes + handler, response envelope, event bus, BullMQ setup, crypto (AES-GCM helper), counter/sequence util.
- P0.3 [H] `packages/shared`: money utils, validators (5.3), permission registry, event names, tracking events, error codes, constants.
- P0.4 [H] Auth module: staff + customer auth, JWT+refresh rotation, password hashing, lockout, CSRF, rate limits, email verify/reset token flow skeleton.
- P0.5 [H] RBAC: roles CRUD, permission middleware, branch scope helper, seed super-admin + default roles.
- P0.6 [M] Settings registry + audit log module + admin settings API.
- P0.7 [M] Admin app shell: Vite, Tailwind, shadcn, layout, login, route guards, `can()`, API client, TanStack Query, i18n setup.
- P0.8 [M] Storefront shell: Next.js, Tailwind, shadcn, layout, SEO helper, i18n/RTL setup, API client.
- P0.9 [M] Shared field components (5.3) + form kit + test suite for validators.
- P0.10 [H] Translation core (5.7): `Language`/`Translation`/`GlossaryTerm` models, `translation` adapter interface + first provider, cache (Mongo+Redis), batching, placeholder/HTML masking, budget guard, BullMQ translate job, `localized()` Mongoose plugin, `resolve(doc, lang)`, `LocalizedString` shared schema, tests (masking, caching, manual-lock, stale handling).
- P0.11 [M] Static UI string pipeline: `t()` + `useT`, `en.json` → generated `ar.json` script (`npm run i18n:translate`), CI stale/missing check, bundle splitting per language.
- P0.12 [M] Storefront language switcher in header, `/ar` routing, `lang` cookie, `<html lang dir>`, RTL tokens + Arabic font, hreflang helper, digit/currency/date formatting by locale, optional auto-detect.
- P0.13 [M] Admin Settings → Languages tab (provider/key, glossary, budget/usage, retranslate all, queue/failed jobs, optional Arabic override with revert-to-auto).

### Phase 1 — Catalog
- P1.1 [M] Media module (upload adapter local, sharp processing, library UI).
- P1.2 [M] Categories tree (unlimited depth, ordering, images, SEO fields) + admin UI (drag reorder).
- P1.3 [M] Brands + Suppliers CRUD.
- P1.4 [H] Product + Variant model: attributes/options (size, color…), per-variant price/cost/sku/barcode/images, variant→image mapping, product custom fields, localized content (`localized()` plugin → auto-translated, incl. attribute names/values), SEO fields.
- P1.5 [M] Admin product UI (create/edit, variant matrix generator, gallery).
- P1.6 [M] Barcode generation (EAN-13/Code128) + uniqueness + scan-to-input (keyboard-wedge handler component).
- P1.7 [M] Bulk import/export (CSV/XLSX template, validation report, background job).
- P1.8 [M] Product search indexing (Mongo text/Atlas-agnostic abstraction; pluggable search adapter).

### Phase 2 — Branches, Inventory, Suppliers
- P2.1 [M] Branch CRUD + staff-branch assignment.
- P2.2 [H] Stock ledger + levels, atomic movements, adjust/transfer/receive, low-stock thresholds, tests for concurrency.
- P2.3 [M] Purchase orders (light): supplier, items, receive into branch → ledger.
- P2.4 [M] Inventory admin UI (levels per branch, movements history, adjustments with reason).

### Phase 3 — Storefront Core
- P3.1 [M] Home/category/subcategory/product pages (SSR), filters, sort, pagination, search with suggestions.
- P3.2 [H] Cart service (guest + user, server-side, merge on login), price/tax/stock revalidation. Custom cart UI (slide-over mini-cart + full page; not typical table).
- P3.3 [M] Product cards (Add to cart + Buy now), variant selector swapping images, animations (Framer Motion), skeletons.
- P3.4 [H] Guest checkout: minimal fields (full name, phone, optional email, address) + admin-defined custom fields (labels/placeholders auto-translated, input values never translated); order creation transaction, stock reserve, idempotency.
- P3.5 [H] Customer accounts: register/login, Google OAuth, forgot/reset password, profile, addresses, order history.
- P3.6 [M] Order tracking page (by order no + phone), status timeline.

### Phase 4 — Payments & Online Orders
- P4.1 [H] Payment adapter interface + COD + first KSA gateway adapter (redirect/hosted flow, webhook verify, refunds).
- P4.2 [M] Admin payment methods (enable/disable, ordering, custom methods, fees).
- P4.3 [H] Order state machine (config), transitions with guards/events, shipments/tracking number, cancellation/restock.
- P4.4 [M] Admin order management UI (filters, detail, status actions, notes, invoice/print).
- P4.5 [M] Transactional email/SMS notifications (adapter + templates editable in admin; templates auto-translated; sent in `order.lang`).

### Phase 5 — CMS & Page Builder
- P5.1 [H] Block registry spec + page JSON schema (versioned) + renderer shared by storefront & admin preview; block props flagged `translatable` are auto-translated on publish/save, preview has EN/AR toggle.
- P5.2 [H] Builder UI: drag/drop (dnd-kit), canvas, props panel, responsive preview, undo/redo, draft/publish/versioning, autosave.
- P5.3 [M] Core blocks: hero carousel (featured products/offers), category grid, product rail (manual / best-selling / newest / by category / by tag), banners, rich text, image/video, FAQ, features, testimonials, countdown/offers, brand strip, newsletter, custom HTML (sanitized), spacer/columns.
- P5.4 [M] Pages CRUD (home, landing, static), menus (header/footer, mega menu; labels auto-translated), global header/footer builder, theme tokens (colors, fonts, radius), announcement bar.
- P5.5 [M] Site settings: title, logo, favicon, contact info, address, social, SEO defaults (all text fields localized + auto-translated), redirects manager, robots/sitemap editor.
- P5.6 [M] Homepage default template seeded (hero → categories → best-sellers → …) fully editable.

### Phase 6 — POS, Printing, Shifts, Returns
- P6.1 [H] POS sale service: scan/search, cart, discounts (rule-based), customer attach (walk-in / phone / email), split/multiple payments, custom payment methods, atomic order+stock+payment+loyalty hook, idempotent.
- P6.2 [M] POS UI (fast keyboard/scan-first, offline-tolerant UI states, hold/resume sale).
- P6.3 [H] Printing layer (client-side in admin): QZ Tray connector, signed-message endpoint, printer profiles (paper width 58–85 mm configurable), ESC/POS builder, template engine for receipts + barcode labels, auto-print after sale without extra click.
- P6.4 [M] Receipt & label template editor (fields, logo, QR (ZATCA TLV), footer, size in mm; receipt language en/ar/bilingual) + printer setup tab in Settings.
- P6.5 [H] Shifts: open/close with cash count, role-based shift rules, X-report, Z-report (+ thermal print), cash in/out.
- P6.6 [H] Returns & exchanges: return to stock/damaged, refund method, exchange rule (new value ≥ old; customer pays difference), new receipt print, ledger + loyalty reversal.

### Phase 7 — Customers, Loyalty, Campaigns
- P7.1 [H] Loyalty engine: earn rule (default 100 SAR = 1 pt, configurable), redeem rule, ledger, membership by phone/email, expiry option, reversal on returns.
- P7.2 [M] Customer admin: profile, lifetime spend, last purchase, points, redemptions, segments.
- P7.3 [M] Campaign module: email + SMS (KSA provider adapter), segments, templates (auto-translated, sent in customer's language), scheduling, opt-out, delivery status, rate/queue.

### Phase 8 — Analytics, Reports, Exports
- P8.1 [M] Dashboard + KPIs, sales graphs (recharts), branch filter (all/specific).
- P8.2 [M] Performance: by staff, product, category, brand, branch, channel.
- P8.3 [M] Forecasting v1 (moving average / seasonality) for sales + stock-out prediction, pluggable strategy.
- P8.4 [M] Universal export (XLSX/CSV/JSON) via background job for all list screens; report builder basics.

### Phase 9 — Tracking & SEO Hardening
- P9.1 [H] Tracking module: integrations UI, dataLayer pushes, event_id, UTM/click-ID capture, consent banner.
- P9.2 [H] Server-side dispatch: GA4 MP, Meta CAPI, Google Ads enhanced conversions via queue with retries + test mode + event log viewer.
- P9.3 [M] SEO audit pass: structured data validation, sitemap, hreflang/canonical per language, redirects, CWV tuning, canonical rules, image optimization.

### Phase 10 — Hardening & Release
- P10.1 [H] Security review pass (authz matrix tests, rate limits, headers, upload tests, secrets encryption, 2FA for admin, translation endpoint abuse/rate limits, PII never sent to translation provider).
- P10.2 [M] Test suites: unit (money, loyalty, exchange, ledger), API (supertest), E2E (Playwright: checkout, POS sale, return/exchange, EN→AR switch with no untranslated English left, RTL layout smoke).
- P10.3 [M] Performance (indexes, caching with Redis, N+1 audit), backup/restore scripts.
- P10.4 [M] Deployment: Dockerfiles, compose/prod, Nginx, SSL, env docs, health checks, log rotation, CI/CD (VPS).
- P10.5 [M] Staff docs in-app help text + admin user guide (single file).

---

## 7. Definition of Done (every task)
- Meets acceptance of the task; permission + validation applied; no hardcoded business constants.
- Lint passes; tests added for logic touching money, stock, loyalty, auth, or validation.
- Server enforces authz and validation; UI mirrors it.
- Events emitted for state changes that others may care about.
- All user-visible text is English-source via `t()`/localized fields (no hardcoded strings, no hand-written Arabic); layout checked in RTL.
- `.env.example`/seed updated if needed.
- `PROGRESS.md` updated (task done, decisions, notes). Commit made.

## 8. Commands (fill/keep accurate)
- `npm run dev` (all) · `npm run dev -w apps/api` · `npm run lint` · `npm test` · `npm run seed` · `docker compose up -d`
