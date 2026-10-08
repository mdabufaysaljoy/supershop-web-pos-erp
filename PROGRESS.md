# PROGRESS.md — project state (update at end of EVERY task)

## Current
- Phase: 0
- Next task: P0.1
- Last model used: —

## Done tasks
(none yet — append IDs like `P0.1 ✔ 2026-10-07 (model) short note`)

## Decisions
- D-001 Storefront = Next.js (SSR for SEO); Admin = Vite SPA; API = Express + Mongoose; monorepo npm workspaces.
- D-002 No TypeScript; JSDoc for key contracts; zod for runtime validation shared across API/UI.
- D-003 Money in integer halalas (SAR). Stock via append-only ledger.
- D-004 Content fields use `LocalizedString` (`en` source + auto `ar`) from day one; English is the only authored language.
- D-005 First payment gateway adapter: TBD (pick a KSA gateway before P4.1).
- D-006 Translation: eager auto-translate on save/build + cache; on-demand only as fallback; provider via adapter (google|azure|deepl|llm) — first provider TBD before P0.10. Admin override optional, never required.
- D-007 Language switcher is storefront-only; URL scheme `/ar/...` (default `en` unprefixed). Admin panel UI stays English in v1.

## Open questions (blockers only)
- Which KSA payment gateway + SMS provider will be used? (needed by P4.1 / P7.3)
- VAT registration number + business details for receipts/ZATCA QR? (needed by P6.4)
- Hosting target confirmed as Vultr VPS? (needed by P10.4)
- Which translation provider (Google / Azure / DeepL / LLM) and monthly budget? (needed by P0.10)

## Change Log
(date — change — impacted modules — tasks added/removed)
- 2026-10-07 — Added EN↔AR header language switcher with fully automatic translation (spec CLAUDE.md 5.7): localized content, UI strings, builder, SEO, notifications, receipts — tasks added: P0.10–P0.13; P1.4, P3.4, P4.5, P5.1, P5.4, P5.5, P6.4, P7.3, P9.3, P10.1, P10.2 amended.

## Notes for next session
(≤5 lines: gotchas, half-done work, env needed)
