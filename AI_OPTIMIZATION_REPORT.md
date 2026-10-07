# AI Optimization Report

This report covers how AI was used to build ApparelFlow ERP, where its output was wrong, how each problem was fixed, and the defensive architecture that keeps the rules enforced even when a single layer fails. Every incident below is recorded, with the commit that fixed it, in the running log [`docs/AI_REVIEW_LOG.md`](docs/AI_REVIEW_LOG.md).

## 1. Tools and prompting

### Tools

| Tool | Used for |
|---|---|
| **Claude (desktop app)** | Reading the PDF brief, mapping every requirement to a planned implementation and test, recording a decision for every point the brief leaves open, and writing `PLAN.md`: the schema, API specification, UI rules, test plan and a phased task list with review gates. |
| **Claude Code (VS Code extension)** | Implementation, driven by `CLAUDE.md` (the project rules) and `PLAN.md` (the specification). |

### How the work was split

- **Phases 0–2 (Mon 5 – Tue 6 Oct): guided mode.** I wrote every line of code and ran every command. Claude Code planned each step, explained it and reviewed what I wrote.
- **From phase 3 (decided Tue 6 Oct, 22:10, to meet the deadline): Claude Code implemented.** I reviewed and merged every pull request myself, ran each phase's review-gate attacks against production with curl and in the browser, and every operation on the production database (migrate, seed, reset) waited for my explicit approval.

### Prompting techniques

1. **A rules file read at the start of every session.** `CLAUDE.md` lists the non-negotiable invariants: the order of checks in every API handler, never trusting client data, the hard stop in both the service and a database trigger, status filters in SQL, an append-only audit log, strict input parsing, and the contrast rules. It also forbids any AI attribution in commits.
2. **Specification first, with a decision log.** Every ambiguity in the brief has a numbered decision in `PLAN.md`, so the agent never had to guess silently; when something wasn't covered, it had to ask.
3. **Version-matched framework docs.** The project uses Next.js 16, which ships its documentation inside `node_modules`. The agent was told to read those guides before writing Next-specific code instead of relying on memory of older versions.
4. **Small phases with review gates.** At each gate the agent stopped, summarised what it built and listed checks for me to run myself (for example, curl attacks expecting 403, 422, 400 and 409) before continuing.
5. **Evidence over claims.** Domain rules were written test-first. Every endpoint is tested against a real Postgres (PGlite) with the production triggers applied. The UI was clicked through in a real browser at 375, 768 and 1280 px, accessibility was checked with axe-core in light and dark mode, and "mutation checks" proved the safety nets work: removing the service's hard-stop check showed the database trigger still refuses the approval, and removing the sewing queue's SQL filter makes PDF Test 5 fail.
6. **A running review log.** Every flaw found in AI output was written down as it happened: what was produced, why it was wrong, how it was found and the commit that fixed it.

## 2. Flawed and broken AI output

The review log holds nine incidents. The five most instructive are below with before-and-after code; the rest follow in a table.

### 2.1 The schema let a rejection be stored without a reason

*Category: data integrity. Found by Claude Code while implementing the schema, reproduced on PGlite.*

The AI-written plan specified this CHECK constraint for the mandatory rejection note:

```sql
-- Before (PLAN.md §6.1)
CHECK (decision <> 'REJECTED' OR char_length(btrim(rejection_note)) >= 10)
```

For a NULL note, `char_length(btrim(NULL))` is NULL, so the whole expression is NULL, and Postgres treats a NULL CHECK result as **passing**. The database would have accepted a REJECTED decision with no reason at all, defeating the database half of a rule the brief makes mandatory.

```sql
-- After (src/server/db/schema.ts, commit 1cf0b11)
CHECK (decision <> 'REJECTED' OR (rejection_note IS NOT NULL AND char_length(btrim(rejection_note)) >= 10))
```

### 2.2 The integrity triggers only guarded updates

*Category: security. Found by Claude Code review of the plan's trigger draft.*

```sql
-- Before (PLAN.md §6.2)
CREATE TRIGGER cutting_orders_guard
BEFORE UPDATE OR DELETE ON cutting_orders ...
```

The database-level hard stop only ran when an order's status *changed*. An order could have been inserted directly as VERIFIED, and items could have been inserted already counted, so "the database enforces the hard stop" was only true for updates.

```sql
-- After (drizzle/0001_integrity_guards.sql, commit ec80713)
CREATE TRIGGER cutting_orders_guard
BEFORE INSERT OR UPDATE OR DELETE ON "cutting_orders" ...

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('CUTTING_IN_PROGRESS', 'PENDING_VERIFICATION') THEN
      RAISE EXCEPTION 'ILLEGAL_TRANSITION: a new order must start in CUTTING_IN_PROGRESS or PENDING_VERIFICATION (got %)', NEW.status;
    END IF;
    RETURN NEW;
  END IF;
```

The items trigger got the same treatment: items must be inserted uncounted.

### 2.3 A late autosave could undo an approval in the browser

*Category: state synchronisation. Found by Claude Code review, then reproduced in Edge by holding back the save's response with Playwright.*

```ts
// Before (src/components/verification/verification-queries.ts, commit c6626fb)
onSuccess: (order) => queryClient.setQueryData(orderKeys.detail(order.id), order),
```

The verifier terminal autosaves counts as they are typed. A save that committed just before an approval, but whose response arrived after it, wrote its PENDING copy of the order over the VERIFIED one in the browser cache. Going back to the batch then showed an editable count sheet and an Approve button next to the "approved" toast. The server was never wrong (a second approval gets 409), but the screen contradicted it.

```ts
// After (commit e287a71)
onSuccess: (order) =>
  queryClient.setQueryData<OrderDto>(orderKeys.detail(order.id), (cached) =>
    isNewerThanSave(cached, order) ? cached : order,
  ),
```

### 2.4 The role switcher changed role on the first arrow key

*Category: accessibility. Found in a keyboard-only walkthrough.*

```tsx
// Before (PLAN.md §8.1: "picking one runs a real login and redirects")
// handleChange signs in as the chosen role at once
<select value={currentRole} onChange={handleChange}>
```

In Chrome and Edge on Windows, a closed `<select>` changes its value on the arrow keys. A keyboard user's first ArrowDown signed them in as the next role and navigated away, and the third role could not be reached without passing through the second (WCAG 3.2.2 On Input, failure F37).

```tsx
// After (src/components/layout/role-switcher.tsx, commit 1f36c3d)
<form onSubmit={handleSubmit}>
  <select value={selectedRole} onChange={handleSelect}>…</select>
  <Button type="submit" disabled={signIn.isPending || selectedRole === currentRole}>Switch</Button>
</form>
```

### 2.5 A flaky-test fix moved the call but not the work

*Category: test reliability. Found by the same test failing again.*

Two tests timed out on a busy machine, and the first fix (commit ce9f032) moved `createTestDb()` from the test bodies into `beforeAll` hooks, which have a longer timeout, with a commit message saying the database now booted there. It didn't:

```ts
// Before (tests/helpers/test-db.ts)
const client = new PGlite({ loadDataDir: new Blob([snapshot]) });   // returns before Postgres has booted
```

PGlite boots in the background and the first query waits for it, so in the health test the whole boot still happened inside the test. The timeout came back under load.

```ts
// After (commit c22f56a)
const client = await PGlite.create({ loadDataDir: new Blob([snapshot]) });   // resolves once Postgres is ready
```

### Other incidents

| Incident | Category | Found by | Fix |
|---|---|---|---|
| The planned schema location made `drizzle-kit generate` crash (`server-only` throws outside Next's server build) | Correctness | Claude Code, reproduced | 1cf0b11 |
| The API wrapper's route signature failed Next's webpack route-type check, which only `next build --webpack` runs | Correctness | Claude Code, reproduced | c6fb59d |
| The test factory created "submitted" orders the app can never produce (round 0, no submission time) | Test fidelity | Failing test | eaed27c |
| Component tables that scroll sideways on phones could not be reached by keyboard (WCAG 2.1.1) | Accessibility | axe-core audit | f06047d |

## 3. How each one was fixed, and why

| | Fix | Why this approach |
|---|---|---|
| 2.1 | `rejection_note IS NOT NULL` inside the CHECK. | The column has to allow NULL for approvals, so `NOT NULL` on the column was not an option. Keeping the rule in the database means a bug in the API can still never store a reasonless rejection. Database guard tests insert REJECTED logs with NULL, blank and too-short notes and expect each to fail. |
| 2.2 | The existing triggers fire on INSERT as well, with insert-specific rules. | The rule depends on another table (the items) and on the order's lifecycle, which a CHECK constraint cannot express. Guard tests try to insert an order that is already VERIFIED and an item that is already counted. |
| 2.3 | A small pure rule, `isNewerThanSave`: a save only succeeds while the order is pending, so a cached order already decided in that round (or in a later one) is newer and stays. Decisions also cancel any refetch still in flight. | Guarding the cache fixes the race where it happens, without serialising every request in the browser, which would have slowed every decision down. The rule has unit tests, and the same Playwright reproduction now shows the decided batch. |
| 2.4 | The select only selects; a Switch button signs in (WCAG technique G80). | It keeps the real sign-in (no passwordless backdoor) and costs mouse users one extra click. Intercepting arrow keys instead would have been fragile across browsers and screen readers. |
| 2.5 | `createTestDb` waits for Postgres to be ready, so the boot always happens in the calling hook. | It fixes the cause once for every test file, instead of raising timeouts. The health check test, which had taken 21 s under load, now takes 0.3 s. |

The incidents in phases 1–2 (2.1, 2.2 and the drizzle-kit and route-type fixes) were found by Claude Code's review, and I typed the fixes myself, in guided mode. From phase 3 on, Claude Code made the fixes and I reviewed each one in its pull request.

## 4. Defensive architecture

The brief requires the rules to hold in state management **and** in the database. Each critical rule is enforced at more than one layer, so no single bug or direct request can break it.

- **State machine in two places.** The legal transitions live in one table, `TRANSITIONS` in [`src/domain/state-machine.ts`](src/domain/state-machine.ts), which the services use to decide and the UI uses to show buttons. The `af_guard_orders` trigger mirrors it and raises `ILLEGAL_TRANSITION` for anything else, however the update arrives.
- **A fixed order of checks in every handler.** [`withApi()`](src/server/http/with-api.ts) runs authentication (401), then the role (403), then the input schema (400), before the service loads anything (404), checks the state (409), applies business rules (422) and writes in one transaction. Because the role is checked before any order is loaded, a caller with the wrong role cannot even learn whether an order exists.
- **Identity from the session, never from the client.** The verifier on every decision is the session user, re-loaded from the database on each request, and every timestamp comes from the database clock. Request bodies are parsed with strict zod schemas that strip unknown keys, so `verifierId`, `status`, `expectedQty` or `wastagePct` in a body are simply ignored; a tamper test proves it.
- **Query isolation in SQL.** The sewing endpoints filter with `WHERE status = 'VERIFIED'` (or `'SEWING_IN_PROGRESS'`) inside the SQL and ignore query parameters, and only each batch's approval record is loaded, filtered in SQL as well. The sewing role gets 403 on every `/api/orders*` read, and starting sewing on an unverified order answers exactly like an order that doesn't exist. PDF Test 5 fails if the SQL filter is removed.
- **An append-only audit trail.** A trigger blocks every UPDATE and DELETE on `verification_logs`; counts are frozen once a batch leaves verification; core order fields are frozen after creation. Each decision stores a snapshot of every component's counts, the wastage and the fabric figures, so it remains a complete record even after a recount.
- **The hard stop in the database.** The same trigger refuses to set VERIFIED while any component is uncounted or short. With the service's own check deliberately removed, every short approval was still refused (422) and rolled back.
- **No side door.** Row-level security is enabled on every table with no policies, so Supabase's auto-generated REST API exposes nothing; the app talks to Postgres only through its own route handlers.
