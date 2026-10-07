# AI Optimization Report

I used AI tools a lot on this assessment, and I want this report to be specific about how. The brief allows AI, but it also says that blindly accepting its output is not acceptable. So most of what follows is about the checks I put around the AI, not about the code it wrote.

How this report was written: I drafted it with Claude from my running review log ([`docs/AI_REVIEW_LOG.md`](docs/AI_REVIEW_LOG.md)), then went through it myself, checked each claim against the code and the commit history, and edited it.

## 1. Tools and prompting

### Which tools, for what

| Task | Tool | Who did the work |
|---|---|---|
| Understanding the brief and planning | Claude (desktop app) | Claude helped me map every requirement in the brief to a planned implementation and a test, and to keep a decision log for every point the brief leaves open. I made the decisions. The result became my build plan, `PLAN.md`, a private working document that is not in this repo. |
| Scaffolding | `create-next-app` | I ran it and committed it myself (Mon 5 Oct). |
| Schema design | Claude for the first draft, Claude Code for review | The draft schema was part of the plan. I typed the schema and migrations myself in guided mode, and Claude Code's review found three flaws in the drafted design (section 2). |
| Styling | Claude Code | I typed the light-only colour tokens and the form-control styles in phase 1, before any screen existed. The later screens were styled by Claude Code, and so were the accessibility fixes at the end. |
| Test generation | Claude Code | The domain tests were written test-first in guided mode, typed by me. From phase 3, Claude Code wrote the tests together with each endpoint, including the five tests the brief requires. |
| Implementation | Claude Code (VS Code extension) | Phases 0–2: I typed every line and Claude Code planned and reviewed. From phase 3: Claude Code wrote the code. |
| Documentation | Claude Code | The README, and the first draft of this report. |
| Deployment | Vercel and Supabase | I created the accounts, set the secrets and environment variables, and ran the first migration and seed myself. The final production seed and reset were run by Claude Code, each only after I explicitly approved it. |

### How the work was split

- **Mon 5 – Tue 6 Oct, phases 0–2: guided mode.** I typed all the code and ran every command. Claude Code planned each step, explained it and reviewed what I wrote.
- **Tue 6 Oct, 22:10: a deadline decision.** To meet the deadline, I switched to having Claude Code write the code from phase 3 onwards. My job became reviewing and merging each pull request, running the review gates, and approving anything that touched the production database.
- Every commit shows my name because the agent committed from my machine with my git identity. From phase 3 on, the code in those commits was written by Claude Code. You can also see it in the history: it speeds up from Tuesday night, and phase 3 is 17 commits in under half an hour.

### The rules I gave the agent

Instead of writing a long prompt every time, I put the rules into files the agent reads at the start of every session. [`CLAUDE.md`](CLAUDE.md) is in the repo root, and the build plan adds the details. The rules that mattered most:

- "Before every commit, run `npm run typecheck && npm run lint && npm test`, and all must pass."
- "When you fix a bug in code you generated earlier, or the human corrects your output, append a factual entry to `docs/AI_REVIEW_LOG.md` … Never invent or exaggerate entries."
- Read the Next.js 16 documentation that ships inside `node_modules` before writing any Next-specific code: "Don't write code from memory of older APIs." (Next.js 16 adds its own `AGENTS.md` that says the same.)
- Eleven non-negotiable security rules. For example, the hard stop must be enforced "in the service (422) **and** in the DB trigger"; sewing data must be filtered in the SQL; identity and timestamps come only from the session and the database.
- Stop at every review gate, list the checks for me, and wait for my "go".
- From the plan: domain rules test-first; build with both Turbopack and webpack; check every screen in a real browser at 375, 768 and 1280 px; and before submitting, an accessibility audit in light and dark mode plus a keyboard-only walkthrough.

I think of this less as prompting and more as setting the conditions the AI works under. The agent doesn't get to decide that something is done; the checks decide.

### Why the commit messages never mention AI

My `CLAUDE.md` tells the agent never to mention AI in commit messages or pull requests. Someone reading that could take it as an attempt to hide something. It isn't. I wanted each commit message to describe the change itself, and I wanted AI use described once, completely, in one place: this report. The agent's rules, the review log and this report are all public in the repo, so anyone can see exactly how the AI was set up and what it got wrong.

## 2. Where the AI got it wrong

### Why the log says "found by Claude"

Seven of the nine entries in the review log say "found by Claude self-review"; the other two say "failing test". None says "found by human review". I want to be straight about that: I didn't personally spot these bugs. What I did was set up the checks that forced the AI to look for them, and every one was caught by a check that existed in advance:

| Mistake | What caught it |
|---|---|
| The planned schema location crashed `drizzle-kit` | Running the real tool instead of trusting the plan |
| A rejection could be stored without a reason | Checking the plan's SQL against the "reason is mandatory" rule, then reproducing it on a real Postgres |
| The database guards only covered updates | Checking that the database rule covers every way a row can change |
| A route type failed the stricter build | Building with webpack as well as the default Turbopack |
| The test factory created orders the app can't produce | A failing test, so the pre-commit check refused the commit |
| A late autosave could undo an approval on screen | The real-browser check of the verifier terminal, then a reproduction |
| A flaky-test fix was incomplete | The same test failing again, so the pre-commit check refused the commit |
| Scrollable tables couldn't be reached by keyboard | The accessibility audit (axe-core) |
| The role switcher changed role on the first arrow key | The keyboard-only walkthrough |

AI checking its own work can share the same blind spots. That's why these checks rely on outside evidence (a real Postgres with the triggers, two build systems, a real browser, an accessibility engine) and not on the AI's own opinion. For the most important rules I also checked myself: at the review gates for the verification and sewing phases I attacked the live API with curl and in the browser, and every response was what it should be.

Five of the nine are below with the code before and after; the rest follow in a table.

### 2.1 A rejection could be stored without a reason

*Data integrity · found while implementing the schema, reproduced on a real Postgres (PGlite)*

The first draft in my plan had this CHECK constraint for the mandatory rejection note:

```sql
-- Before (my build plan, §6.1)
CHECK (decision <> 'REJECTED' OR char_length(btrim(rejection_note)) >= 10)
```

It looks right, but it isn't. When the note is NULL, the whole expression is NULL, and Postgres treats a NULL CHECK as passing. The database would have accepted a rejection with no reason at all, which is exactly what the brief says must never happen.

```sql
-- After (src/server/db/schema.ts, commit 1cf0b11)
CHECK (decision <> 'REJECTED' OR (rejection_note IS NOT NULL AND char_length(btrim(rejection_note)) >= 10))
```

### 2.2 The database guards only covered updates

*Security · found by reviewing the trigger draft against the "the database enforces the hard stop" rule*

```sql
-- Before (my build plan, §6.2)
CREATE TRIGGER cutting_orders_guard
BEFORE UPDATE OR DELETE ON cutting_orders ...
```

The trigger that stops a short batch from becoming VERIFIED only ran on UPDATE. Inserting an order directly as VERIFIED, or inserting items that were already counted, would have skipped it. So "the database enforces the hard stop" was only half true.

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

The items trigger got the same change: items must be inserted uncounted.

### 2.3 A late autosave could undo an approval on screen

*State sync · found in the browser check, reproduced in Edge by holding back the save's reply*

```ts
// Before (src/components/verification/verification-queries.ts, commit c6626fb)
onSuccess: (order) => queryClient.setQueryData(orderKeys.detail(order.id), order),
```

The verifier terminal saves counts as you type. If a save was still on its way when the verifier approved, its reply could arrive after the approval and overwrite the cached VERIFIED order with the older PENDING copy. Going back to the batch then showed an editable count sheet and an Approve button, right next to the "approved" message. The server was never wrong (a second approval gets 409), but the screen contradicted it.

```ts
// After (commit e287a71)
onSuccess: (order) =>
  queryClient.setQueryData<OrderDto>(orderKeys.detail(order.id), (cached) =>
    isNewerThanSave(cached, order) ? cached : order,
  ),
```

### 2.4 The role switcher changed role on the first arrow key

*Accessibility · found in the keyboard-only walkthrough*

My plan said the role switcher is a select where "picking one runs a real login and redirects", and that's what I built in phase 2:

```tsx
// Before (src/components/layout/role-switcher.tsx)
// handleChange signs in as the chosen role at once
<select value={currentRole} onChange={handleChange}>
```

In Chrome and Edge on Windows, a closed select changes its value when you press the arrow keys. So a keyboard user's first ArrowDown signed them in as the next role and took them off the page, and the third role couldn't be reached without passing through the second (WCAG 3.2.2). Now picking a role only selects it, and a Switch button signs in:

```tsx
// After (commit 1f36c3d)
<form onSubmit={handleSubmit}>
  <select value={selectedRole} onChange={handleSelect}>…</select>
  <Button type="submit" disabled={signIn.isPending || selectedRole === currentRole}>Switch</Button>
</form>
```

This one came from my own plan, so it's a good reminder that the spec can be wrong too, not just the code.

### 2.5 A test fix that moved the call but not the work

*Test reliability · found when the same test failed again*

Two tests timed out on my machine when it was busy. The first fix (commit ce9f032) moved the database setup out of the test bodies into setup hooks, which have a longer time limit, and its commit message said the database now booted there. It didn't:

```ts
// Before (tests/helpers/test-db.ts)
const client = new PGlite({ loadDataDir: new Blob([snapshot]) }); // returns before Postgres has booted
```

PGlite boots in the background and the first query waits for it, so in the health check test the whole boot still happened inside the test. About five hours later the test failed again, and the pre-commit check refused the commit.

```ts
// After (commit c22f56a)
const client = await PGlite.create({ loadDataDir: new Blob([snapshot]) }); // resolves once Postgres is ready
```

My takeaway: a fix that makes the symptom go away doesn't prove the cause is understood.

### The rest of the log

| Mistake | Type | Found by | Fix |
|---|---|---|---|
| The planned schema location crashed `drizzle-kit generate` (`server-only` throws outside Next's server build) | Correctness | Claude Code, reproduced | 1cf0b11 |
| A route type failed Next's webpack route-type check, which only `next build --webpack` runs | Correctness | Claude Code, reproduced | c6fb59d |
| The test factory created "submitted" orders the app can never produce (round 0, no submission time) | Test fidelity | Failing test | eaed27c |
| Component tables that scroll sideways on phones couldn't be reached by keyboard (WCAG 2.1.1) | Accessibility | Accessibility audit | f06047d |

### When the process itself slipped

One more, which isn't in the code log because it was a mistake in the process rather than the code. On Wednesday morning the agent ran the pre-commit check as `npm test | grep …`, so the shell checked grep's exit code instead of the tests'. Two tests had failed, and a commit (31b7be1) went through anyway. The agent noticed straight away and told me. It re-ran the suite, which passed: the failures were timeouts on a busy machine. From then on it checked the real exit code before every commit. Even the guardrail needed guarding.

## 3. How I fixed and hardened the code

**Who did the fixing.** The problems found during phases 1–2 (2.1, 2.2, the `drizzle-kit` crash and the route type) I fixed myself, typing the changes in guided mode. From phase 3 on, Claude Code wrote the fixes and I reviewed them in the pull requests before merging.

**The judgment calls that were mine:**

- **The database is the last line of defence, not just the API.** Triggers, CHECK constraints and row-level security enforce the rules even if the application code has a bug.
- **REST route handlers instead of Server Actions,** so every rule can be attacked with curl and Postman through one gateway that checks things in a fixed order.
- **A written log of every AI mistake, from day one,** and a rule that nothing in it may be invented or exaggerated.
- **Switching to agent implementation at Tue 22:10 to meet the deadline,** with tests, review gates and pull requests as my control instead of typing every line.
- **Accepting the role switcher change,** even though it departs from my own plan's wording, because the accessibility problem was real.
- **Nothing touches the production database without my explicit approval.** The final reset to clean demo data only ran after I confirmed it.
- **Keeping the brief (a company document) and my private plan out of the public repo.**

**How each fix was chosen:**

| | Fix | Why this way |
|---|---|---|
| 2.1 | `rejection_note IS NOT NULL` inside the CHECK | The column has to allow NULL for approvals, so `NOT NULL` on the column wasn't an option. Keeping the rule in the database means even an API bug can't store a rejection without a reason. Database tests insert rejections with NULL, blank and too-short notes and expect each one to fail. |
| 2.2 | The triggers now fire on INSERT too | The rule depends on another table (the items) and on the order's lifecycle, which a CHECK constraint can't express. Database tests try to insert an order that's already VERIFIED and an item that's already counted. |
| 2.3 | A small pure rule, `isNewerThanSave`, at the cache | A save only succeeds while the order is pending, so a cached order that's already decided is the newer one and stays. Serialising every request in the browser would also have worked, but it would have slowed every decision down. The rule has unit tests, and the same browser reproduction now shows the decided batch. |
| 2.4 | Pick a role, then press Switch (WCAG technique G80) | It keeps the real sign-in with no passwordless backdoor, at the cost of one extra click. Intercepting arrow keys instead would have been fragile across browsers and screen readers. |
| 2.5 | Wait for Postgres inside `createTestDb` | It fixes the cause once for every test file instead of raising timeouts. The health check test went from 21 seconds under load to 0.3. |

**What I'd do differently with more time:**

- Commit the browser checks as an end-to-end test suite (they were run during development, not committed).
- Seed more pending demo orders, so several evaluators testing at once don't run out of batches to verify.
- Read more of the agent's code line by line myself, instead of relying mainly on the gates and the tests.

## 4. Defensive architecture

The brief asks for the rules to hold in state management **and** in the database. Each critical rule here is enforced in more than one layer, so a single bug or a hand-made request can't break it.

- **The state machine lives in two places.** The legal transitions are one table, `TRANSITIONS` in [`src/domain/state-machine.ts`](src/domain/state-machine.ts), which the services use to decide and the UI uses to show buttons. The `af_guard_orders` trigger mirrors it and raises `ILLEGAL_TRANSITION` for anything else, however the update arrives.
- **Every handler checks in the same order.** [`withApi()`](src/server/http/with-api.ts) runs:
  1. authentication (401)
  2. the role (403)
  3. the input schema (400)
  4. then the service loads the order (404), checks its state (409), applies the business rules (422) and writes in one transaction

  The role is checked before any order is loaded, so a caller with the wrong role can't even learn whether an order exists.
- **Identity comes from the session, never from the client.** The verifier on every decision is the session user, reloaded from the database on each request, and every timestamp comes from the database clock. Request bodies go through strict zod schemas that strip unknown keys, so `verifierId`, `status`, `expectedQty` or `wastagePct` in a body are simply ignored. A tamper test proves it.
- **Query isolation is in the SQL.**
  - The sewing endpoints filter with `status = 'VERIFIED'` (or `'SEWING_IN_PROGRESS'`) in the SQL WHERE clause and ignore query parameters.
  - Only each batch's approval record is loaded, also filtered in SQL.
  - The sewing role gets 403 on every `/api/orders*` read, and starting sewing on an unverified order gets exactly the same 404 as an order that doesn't exist.
  - If the SQL filter is removed, PDF Test 5 fails.
- **The audit trail is append-only.** A trigger blocks every UPDATE and DELETE on `verification_logs`. Counts are frozen once a batch leaves verification, and core order fields are frozen after creation. Each decision stores a snapshot of every component's counts, the wastage and the fabric figures, so it stays a complete record even after a recount.
- **The hard stop is in the database too.** The same trigger refuses to set VERIFIED while any component is uncounted or short. To be sure it works on its own, we temporarily removed the service's own check: every short approval was still refused (422) and rolled back.
- **There's no side door.** Row-level security is on for every table with no policies, so Supabase's auto-generated REST API exposes nothing. The app talks to Postgres only through its own route handlers.
