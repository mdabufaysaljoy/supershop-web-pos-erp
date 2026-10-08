# PROGRESS.md — project state (update at end of EVERY task)

## Current
- Phase: 0
- Next task: P0.3
- Last model used: Opus 5.5

## Done tasks
- P0.1 ✔ 2026-10-08 (Opus 5.5) Monorepo scaffold: npm workspaces (apps/api, packages/shared, packages/ui), ESM, ESLint 9 flat config with layer/module/vendor-SDK boundary rules, Prettier, husky + lint-staged + commitlint, Vitest 5, docker-compose (Mongo 7 single-node replset + Redis 7 noeviction), CI (lint, format, test, prod audit), `.env.example`, API `/api/v1/health` + tests.
- P0.2 ✔ 2026-10-08 (Opus 5.5) `apps/api/src/core`: zod-validated env config (fail-fast, prod rejects dev secrets), pino logger + pino-http (request id, PII-safe serializers, redaction), AppError hierarchy + central error handler (zod/mongoose/body-parser/E11000 mapping, no internals leaked), `{data,meta}` envelope helpers, Mongo connect + `withTransaction` (snapshot/majority), Redis client, BullMQ queues/workers (retries, idempotent `jobId`, graceful close), in-process event bus (async, isolated subscribers), AES-256-GCM secrets (+AAD, mask, sha256, safeEqual), atomic counters (gapless inside txn). App: helmet, CORS allowlist, simple query parser, `/health` (live) + `/health/ready` (db+redis). Shared `ERROR_CODES` added. 40 tests (in-memory Mongo replset; Redis tests run when `TEST_REDIS_URL` set / in CI).

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
- P0.3: move event-name registry into shared and validate names in `core/events.js`; extend `ERROR_CODES`.
- P0.7/P0.8 must add `admin`/`storefront` to root `dev` script + React/Next ESLint plugins.
