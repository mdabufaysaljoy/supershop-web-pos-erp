# PROGRESS.md — project state (update at end of EVERY task)

## Current
- Phase: 0
- Next task: P0.6
- Last model used: Opus 5.5

## Done tasks
- P0.1 ✔ 2026-10-08 (Opus 5.5) Monorepo scaffold: npm workspaces (apps/api, packages/shared, packages/ui), ESM, ESLint 9 flat config with layer/module/vendor-SDK boundary rules, Prettier, husky + lint-staged + commitlint, Vitest 5, docker-compose (Mongo 7 single-node replset + Redis 7 noeviction), CI (lint, format, test, prod audit), `.env.example`, API `/api/v1/health` + tests.
- P0.2 ✔ 2026-10-08 (Opus 5.5) `apps/api/src/core`: zod-validated env config (fail-fast, prod rejects dev secrets), pino logger + pino-http (request id, PII-safe serializers, redaction), AppError hierarchy + central error handler (zod/mongoose/body-parser/E11000 mapping, no internals leaked), `{data,meta}` envelope helpers, Mongo connect + `withTransaction` (snapshot/majority), Redis client, BullMQ queues/workers (retries, idempotent `jobId`, graceful close), in-process event bus (async, isolated subscribers), AES-256-GCM secrets (+AAD, mask, sha256, safeEqual), atomic counters (gapless inside txn). App: helmet, CORS allowlist, simple query parser, `/health` (live) + `/health/ready` (db+redis). Shared `ERROR_CODES` added. 40 tests (in-memory Mongo replset; Redis tests run when `TEST_REDIS_URL` set / in CI).
- P0.3 ✔ 2026-10-08 (Opus 5.5) `packages/shared`: money (integer halalas, basis-point rates, BigInt half-away-from-zero rounding, VAT split gross/net exact, largest-remainder `allocate`, Intl formatting with digit style), `normalizeDigits` (Arabic-Indic → ASCII), validators §5.3 (name, email, KSA/intl phone normalize → E.164, money minor/input, quantity, address/plainText, password policy factory, sku, barcode, slug + `toSlug`, objectId, httpUrl, `paginationQuery` with sort whitelist) + keystroke sanitizers, permission registry (63 keys, groups, `PERMISSIONS` constants, `hasPermission`), domain `EVENTS` (API event bus now rejects unknown names), `TRACKING_EVENTS`, extended `ERROR_CODES`, constants/DEFAULTS, subpath exports. 102 shared tests.
- P0.4 ✔ 2026-10-08 (Opus 5.5) Auth module (`modules/auth`) for staff + customers: argon2id (OWASP params, transparent rehash, dummy-hash timing equalization), HS256 access JWT (15 min, audience per principal type) + opaque rotating refresh token in httpOnly/SameSite=Strict/path-scoped cookie, refresh reuse detection (revokes family; 10 s grace for concurrent tabs), per-request session liveness check (logout/revocation immediate), session cap (10), lockout (5 fails → 15 min, atomic), password change/forgot/reset (single-use hashed tokens, revoke sessions), customer email verification, CSRF guard (custom header + Origin allowlist) for cookie routes, Redis rate limiters (global fail-open; auth fail-closed; per-identifier counts failures only), validate middleware (`req.valid`), `$`/dotted-key rejection. Staff + customers modules (profiles only; auth via principal adapter registry), `POST /customers/register`, composition root `modules/index.js`. 85 API tests.
- P0.5 ✔ 2026-10-08 (Opus 5.5) RBAC: `core/access.js` AccessContext (can/assert, branch scope `assertBranch`/`branchFilter`, escalation helpers), `requirePermission`/`requireAnyPermission`/`requireStaff` middleware (auth + live access resolution, super-admin bypass audited via `access.superAdminUsed`), roles module (`/api/v1/roles` CRUD, permission catalog, 8 seeded system roles, case-insensitive names, system/in-use protection), staff management (`/api/v1/staff` list/search/paginate, create/update/soft-delete, force logout, `/staff/me/access`) with guards: grant only what you hold, branch-scoped reach, no self-modification, super-admins only by super-admins, last-super-admin write-skew guard (verified the race is real without it), disable/delete revokes sessions. `npm run seed` (idempotent roles + first super-admin). 116 API tests.

## Decisions
- D-001 Storefront = Next.js (SSR for SEO); Admin = Vite SPA; API = Express + Mongoose; monorepo npm workspaces.
- D-002 No TypeScript; JSDoc for key contracts; zod for runtime validation shared across API/UI.
- D-003 Money in integer halalas (SAR). Stock via append-only ledger.
- D-004 Content fields use `LocalizedString` (`en` source + auto `ar`) from day one; English is the only authored language.
- D-005 First payment gateway adapter: TBD (pick a KSA gateway before P4.1).
- D-006 Translation: eager auto-translate on save/build + cache; on-demand only as fallback; provider via adapter (google|azure|deepl|llm) — first provider = **LibreTranslate, self-hosted** (free, open source, no API key, no per-character cost, text never leaves our servers; added as a docker-compose service in P0.10). Also ship a `noop` provider (translation disabled → storefront falls back to English) selectable in settings. Paid providers stay possible via the adapter, no code change elsewhere. Budget guard still built but defaults to unlimited for self-hosted. Known trade-off: Arabic quality is lower than paid APIs; glossary + optional manual override cover key terms. (User decision 2026-10-08: "use any free translation service or don't do it"). Admin override optional, never required.
- D-007 Language switcher is storefront-only; URL scheme `/ar/...` (default `en` unprefixed). Admin panel UI stays English in v1.

- D-008 ESM (`"type":"module"`) everywhere; Node >=22.12 (`.nvmrc`). API dev uses `node --watch --env-file-if-exists=../../.env` (no nodemon/dotenv). Root `.env` serves API + compose; frontends get their own env in P0.7/P0.8.
- D-009 Mongo dev URI uses `directConnection=true` to the single-node replset (member host `localhost:27017`); transactions verified from host.
- D-010 Architecture boundaries enforced in `eslint.config.js` via `no-restricted-imports` (controller/routes ↛ repo/model, service ↛ model, cross-module only via `index.js`, vendor SDKs only in `adapters/`, packages ↛ apps, client ↛ server libs). Flat config replaces rule options per block, so use the `restrict()` helper when adding blocks.
- D-011 `overrides.shell-quote ^1.12.0` (patched transitive of concurrently, dev only); remove once concurrently ships it.
- D-012 Error body adds `requestId` (additive to `{ error: { code, message, details? } }`) for support/log correlation.
- D-013 Events are in-process and emitted AFTER commit; durable side effects must be enqueued to BullMQ by the subscriber. A transactional outbox can be added later if lost-on-crash events become a problem.
- D-014 Tests: `mongodb-memory-server` replset (real transactions) via `apps/api/test/mongo.js`; Redis integration tests gated by `TEST_REDIS_URL` (CI runs a Redis service). Dev Mongo bumped to `mongo:8.0` to match test binary family.
- D-015 `.env.example` ships working DEV-ONLY secrets so local setup is copy-and-run; `config.js` refuses them when `NODE_ENV=production`.
- D-016 Validator messages are i18n KEYS (`validation.*`, see `validators/messages.js` `V`), never English; API returns them in `error.details[].message`, UI renders `t(key)`. P0.11 must add these keys to `en.json`.
- D-017 Rates (VAT, discounts) are integer basis points (1500 = 15%); rounding = half away from zero, once per computed amount. Line-level vs invoice-level VAT rounding policy is decided in P3.2/P6.1 (ZATCA check).
- D-018 Phone default = KSA mobiles only (`+9665XXXXXXXX`); `phone({ allowInternational: true })` driven by a setting. Business limits (max qty, password policy) are factory params fed from settings; `DEFAULTS` in shared are seed values only.
- D-019 Auth state (password hash, lockout, sessions, one-time tokens) lives ONLY in the auth module's collections (`auth_credentials`, `auth_sessions`, `auth_tokens`). Staff/customers modules register a `PrincipalAdapter` (lookup/profile) in `modules/index.js`; auth never imports them (no cycles).
- D-020 Access token in memory (Bearer) + refresh cookie. CSRF applies only to cookie routes (refresh/logout): `X-CSRF-Protection: 1` header + Origin/Referer allowlist + SameSite=Strict. Requires API and apps on the same SITE (e.g. api.example.com + example.com); set `COOKIE_DOMAIN` accordingly.
- D-021 Every authenticated request checks session liveness in Mongo (indexed `_id` lookup) so revocation is immediate; cache in Redis in P10.3 if needed.
- D-022 Enumeration: login/forgot are generic; ACCOUNT_LOCKED (423) / ACCOUNT_DISABLED (403) only shown after a correct password. Registration returns 409 with conflicting field names (accepted risk, rate-limited); claiming a passwordless guest record must go through email proof (reset flow) — revisit in P3.5.
- D-023 Auth policy (TTLs, lockout, session cap) in `modules/auth/auth.policy.js`; moves to settings `security.*` in P0.6. Password policy default = shared `password()` defaults until P0.6.
- D-024 One-time tokens travel to the email subscriber in the event payload (`auth.passwordResetRequested`, `auth.emailVerificationRequested`); in development only, links are logged (P4.5 adds real email).
- D-025 Branch reach = role `allBranches` flag (HQ/accounting/content) OR the staff member's assigned `branchIds`; super-admin = all. (Chosen over per-role branch lists: simpler, covers the cases; revisit if needed.)
- D-026 Privilege-escalation rules: non-super-admins can only grant/assign permissions and branches they hold, cannot edit roles holding more than they do, cannot edit their own role/status/branches/super-admin flag; super-admin flag only set/changed by super-admins. Seeded roles are templates: inserted once, never overwritten, editable, not deletable.
- D-027 Access is resolved per request from Mongo (staff + role), so role/permission changes apply on the next request. Cache in Redis in P10.3 with explicit invalidation on `role.updated`/`staff.updated`.

## Open questions (blockers only)
- Which KSA payment gateway + SMS provider will be used? (needed by P4.1 / P7.3)
- VAT registration number + business details for receipts/ZATCA QR? (needed by P6.4)
- Hosting target confirmed as Vultr VPS? (needed by P10.4)

## Change Log
(date — change — impacted modules — tasks added/removed)
- 2026-10-08 — Translation provider fixed to free self-hosted LibreTranslate + `noop` fallback (D-006) — impacts P0.10 (adds LibreTranslate container to docker-compose), P0.13 (provider select: libretranslate|noop, API key optional) — no tasks added/removed.
- 2026-10-07 — Added EN↔AR header language switcher with fully automatic translation (spec CLAUDE.md 5.7): localized content, UI strings, builder, SEO, notifications, receipts — tasks added: P0.10–P0.13; P1.4, P3.4, P4.5, P5.1, P5.4, P5.5, P6.4, P7.3, P9.3, P10.1, P10.2 amended.

## Notes for next session
- Local setup: `nvm use && npm install && cp .env.example .env && docker compose up -d --wait && npm run dev` → http://localhost:4000/api/v1/health/ready
- `npm run check` = lint + format:check + test. Redis tests locally: `TEST_REDIS_URL=redis://127.0.0.1:6379 npm test`.
- Mongoose 9 gotchas: `Model.create([...], { session, ordered: true })` for multi-doc in a txn; use `returnDocument: 'after'` (not `new: true`); collections can't be created inside a txn (call `createCollection()`/`init()` first).
- Auth for clients: login returns `data.accessToken`; call `POST /api/v1/auth/<staff|customer>/refresh` with `credentials: 'include'` + header `X-CSRF-Protection: 1` on 401 TOKEN_EXPIRED. Dev: reset/verify links are printed in the API log.
- Protect staff routes with `requirePermission(PERMISSIONS.X)` (includes auth); pass `req.access` to services as `actor`; scope branch data with `actor.branchFilter()` / `actor.assertBranch(id)`.
- First run: `npm run seed` (set `SEED_ADMIN_EMAIL`; password generated+printed if `SEED_ADMIN_PASSWORD` empty, dev only).
- P0.6 audit log should subscribe to: `auth.*`, `role.*`, `staff.*`, `access.superAdminUsed`, `settings.updated` (payloads carry `actorId`, `before`/`after`).
- Shared imports: `import { EVENTS, PERMISSIONS, toMinor, validators } from '@supershop/shared'` or subpaths `@supershop/shared/validators`.
- P0.7/P0.8 must add `admin`/`storefront` to root `dev` script + React/Next ESLint plugins.
