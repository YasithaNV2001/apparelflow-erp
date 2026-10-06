# AI Review Log

A running, factual record of problems found in AI-generated code during this project: what was wrong, how it was caught and how it was fixed. `AI_OPTIMIZATION_REPORT.md` is written from these entries, so every entry must be true and specific.

## Entry format

```
## <date time> — <short title>
- Phase/Task: P4.1      - Found by: human review | failing test | Claude self-review
- What the AI produced: <file:line + short snippet/description>
- Why it was wrong/risky: <security | correctness | contrast/a11y | state-sync | performance>
- Fix: <what changed>   - Commit: <hash>
```

## Entries

## 2026-10-06 15:35 — Schema location broke drizzle-kit
- Phase/Task: P1.5      - Found by: Claude self-review (reproduced: `drizzle-kit generate` crashed at schema.ts:1)
- What the AI produced: PLAN.md §4.3 puts the Drizzle schema in `src/server/db/schema.ts`, where every file must start with `import "server-only"`, and lists `db:generate` as plain `drizzle-kit generate`.
- Why it was wrong/risky: correctness. `server-only` throws unless the `react-server` export condition is active, so drizzle-kit (a plain Node CLI) crashed while loading the schema and no migration could be generated.
- Fix: `db:generate` runs `node --conditions=react-server ./node_modules/drizzle-kit/bin.cjs generate`, the same condition Next.js uses for server code (package.json).   - Commit: 1cf0b11

## 2026-10-06 15:35 — Rejection-note CHECK accepted a REJECTED log with a NULL note
- Phase/Task: P1.5      - Found by: Claude self-review (reproduced on PGlite)
- What the AI produced: PLAN.md §6.1 CHECK on verification_logs: `decision <> 'REJECTED' OR char_length(btrim(rejection_note)) >= 10`
- Why it was wrong/risky: correctness/security. With a NULL note the expression is NULL, and Postgres treats a NULL CHECK result as passing, so the database accepted a REJECTED decision with no reason, defeating the DB-level half of the mandatory rejection note (R12).
- Fix: `decision <> 'REJECTED' OR (rejection_note IS NOT NULL AND char_length(btrim(rejection_note)) >= 10)` (constraint `verification_logs_rejection_needs_note`, src/server/db/schema.ts).   - Commit: 1cf0b11

## 2026-10-06 15:35 — Integrity triggers did not guard INSERT
- Phase/Task: P1.5      - Found by: Claude self-review
- What the AI produced: PLAN.md §6.2 declared `cutting_orders_guard` and `verification_items_guard` as `BEFORE UPDATE OR DELETE` only.
- Why it was wrong/risky: security. An order could be inserted directly with status VERIFIED, skipping the DB-level hard stop, and items could be inserted already counted, so "the database enforces the hard stop" only held for updates.
- Fix: both triggers also fire on INSERT; a new order must start in CUTTING_IN_PROGRESS or PENDING_VERIFICATION and items must be inserted uncounted (drizzle/0001_integrity_guards.sql).   - Commit: ec80713



## 2026-10-06 20:15 — withApi's route signature failed Next's webpack route type check
- Phase/Task: P2.2      - Found by: Claude self-review (reproduced with `next build --webpack`)
- What the AI produced: src/server/http/with-api.ts typed every route export as `(request: Request, context?: { params: Promise<RouteParams> }) => Promise<Response>`.
- Why it was wrong/risky: correctness. Next's webpack build infers each route export's second parameter and requires `{ params: Promise<…> }`; the optional parameter made it `… | undefined`, so `next build --webpack` failed type checking for all four API routes. The default Turbopack build does not run that check, so it went unnoticed.
- Fix: `RouteHandler` became an interface with two call signatures, the Next.js one last, which both builders accept while tests can still call a route with just a request.   - Commit: c6fb59d

## 2026-10-06 22:19 — Test factory created "submitted" orders that the app could never produce
- Phase/Task: P3.2      - Found by: failing test (orders-submit: resubmit expected round 2, got 1)
- What the AI produced: tests/helpers/factories.ts `createOrder()` (written in P1.6) inserted PENDING_VERIFICATION orders with `verification_round = 0` and no `submitted_at`.
- Why it was wrong/risky: correctness (test fidelity). The real `createOrder` service gives a submitted order round 1 and a submission time, so tests built on the factory exercised a state production can never reach and would have hidden off-by-one bugs in round counting.
- Fix: the factory now mirrors the service: round 1 and `submitted_at` set for PENDING_VERIFICATION orders.   - Commit: eaed27c
