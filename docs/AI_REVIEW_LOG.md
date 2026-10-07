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

## 2026-10-07 08:19 — A late autosave answer undid an approval in the browser cache
- Phase/Task: P4.3      - Found by: Claude self-review (reproduced in Edge with Playwright by holding back the save's response)
- What the AI produced: src/components/verification/verification-queries.ts `useSaveCounts` (commit c6626fb) wrote every save's answer straight into the cache: `onSuccess: (order) => queryClient.setQueryData(orderKeys.detail(order.id), order)`. The terminal's autosave (commit 04df63b) lets a save that is already in flight finish while Approve is sent.
- Why it was wrong/risky: state-sync. A save that committed just before an approval but answered after it put its PENDING copy of the order over the VERIFIED one. Going back to the batch then showed it as pending, with an editable count sheet and the Approve button, beside the "approved" toast, until a refetch corrected it. The server was never wrong: it kept the order VERIFIED and would have refused a second approve with 409.
- Fix: `isNewerThanSave()` keeps a cached order that is already decided in that round or in a later one (a save only succeeds while the order is pending), and the approve/reject mutations cancel any refetch of the order still in flight. Unit tests in tests/unit/verification-queries.test.ts; the same Playwright run now shows the decided notice.   - Commit: e287a71

## 2026-10-07 13:41 — A flaky-test fix moved the call but not the work
- Phase/Task: P6.1      - Found by: failing test (the health check test timed out again, 21.3 s against the 20 s limit, after the earlier fix)
- What the AI produced: commit ce9f032 moved `createTestDb()` from the health and db-client test bodies into `beforeAll`/`beforeEach`, and its message said "The boot now happens in beforeAll/beforeEach". But `createTestDb` (tests/helpers/test-db.ts, from 6f42766) returned right after `new PGlite({ loadDataDir })`, before Postgres had booted.
- Why it was wrong/risky: correctness (test reliability). PGlite boots in the background and the first query waits for it, so in the health test the whole boot still ran inside the test and its 20 s timeout. The fix treated the symptom without checking where the time actually went, and the commit message claimed more than the change did.
- Fix: `createTestDb` uses `await PGlite.create(...)`, which resolves once Postgres is ready, so the boot always lands in the calling hook; the health check test now takes 0.3 s.   - Commit: c22f56a

## 2026-10-07 13:41 — Scrollable component tables were unreachable by keyboard
- Phase/Task: P6.1      - Found by: Claude self-review (axe-core audit of every page at 375/768/1280 px, light and emulated dark mode)
- What the AI produced: the component tables in src/components/orders/order-detail.tsx (P3, 7a18e4e) and src/components/sewing/sewing-board.tsx (P5, 40acf97) sit in `<div className="overflow-x-auto">` with no focusable content.
- Why it was wrong/risky: contrast/a11y. At 375 px those boxes scroll sideways, but keyboard-only users could not focus or scroll them, so the variance and status columns were out of reach (axe `scrollable-region-focusable`, serious; WCAG 2.1.1 Keyboard).
- Fix: each scroll box is a named region with `tabIndex={0}`, so it takes focus, shows the focus ring and scrolls with the arrow keys; the re-run audit reports no violations.   - Commit: f06047d

## 2026-10-07 13:50 — The role switcher signed keyboard users in on their first arrow key
- Phase/Task: P6.1      - Found by: Claude self-review (keyboard-only walkthrough in Edge with Playwright)
- What the AI produced: PLAN.md §8.1, written with Claude, specified the Role Switcher as "a `<select>` of the 3 personas; picking one runs a real login and redirects", implemented as specified in src/components/layout/role-switcher.tsx (P2, b473c4f) with the sign-in in the select's `onChange`.
- Why it was wrong/risky: contrast/a11y. In Chrome and Edge on Windows a closed select changes value on ArrowUp/ArrowDown, so a keyboard user's first arrow key signed them in as the next role and navigated away, and the third role could not be reached without passing through the second (WCAG 3.2.2 On Input, failure F37).
- Fix: choosing a role only selects it; a Switch button, disabled for the current role, performs the real sign-in (WCAG technique G80). The walkthrough now stays on the page after an arrow key and switches with Tab + Enter.   - Commit: 1f36c3d
