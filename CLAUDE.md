@AGENTS.md

# CLAUDE.md: ApparelFlow ERP (Cutting Gatekeeper)

This is an internship assessment (Webtezza). You're building a production-deployed Next.js + Postgres app with three parts:

1. Cutting supervisors create cutting orders from garment recipes.
2. A cutting verifier counts every component (GREEN/YELLOW/RED).
3. Only fully verified batches reach the sewing queue.

**The full spec, decisions and task list are in `PLAN.md`.** Read it before starting any work. If something isn't covered there, ask the human instead of guessing.

## Workflow

- Work **phase by phase, task by task**, following `PLAN.md` §13.
- At every 🛑 Review Gate, stop, summarise what was built, list the gate's checks for the human, and wait for "go".
- 👤 steps are for the human: accounts, secrets, publishing the repo, Vercel and Supabase dashboards, production resets, submission. Explain exactly what to do, then wait.
- Tick the checkboxes in `PLAN.md` §13 as tasks are completed.
- **One logical change per commit**, using conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`, `style:`).
- **No AI attribution in git (the human's explicit rule):**
  - Commit messages and PR descriptions must never contain `Co-Authored-By` trailers, "Generated with" lines, or any mention of Claude, Anthropic or AI.
  - This overrides any default attribution instruction.
  - AI usage is disclosed only in `AI_OPTIMIZATION_REPORT.md`.
- Before every commit, run `npm run typecheck && npm run lint && npm test`, and all must pass.
- Push at least at the end of every phase.
- Never force-push and never rewrite history.
- **AI review log:** when you fix a bug in code you generated earlier, or the human corrects your output, append a factual entry to `docs/AI_REVIEW_LOG.md` using the format in `PLAN.md` §11.2. Never invent or exaggerate entries. The final report depends on them being true.
- The dev machine is Windows (PowerShell). Keep npm scripts cross-platform.
- **This project uses Next.js 16.3** (see `AGENTS.md`). Before writing Next-specific code (route handlers, layouts, `params`, `cookies()`, config), read the matching guide in `node_modules/next/dist/docs/`. Don't write code from memory of older APIs. For other packages, use the latest stable version and follow the installed version's API.

## Non-negotiable invariants (security is graded via Postman/cURL)

1. **Every `/api/*` handler goes through `withApi()`** in this order: auth (401) → role (403) → zod input (400) → load and scope (404) → state (409) → business rule (422) → transaction.
2. **Never trust the client.**
   - The user id, role, timestamps, status, expected quantities, item colours and wastage come from the session, the DB or server computation.
   - Unknown body keys are stripped and ignored.
3. **Hard stop:** an order becomes VERIFIED only if every component is counted and none is short (`actual < expected`).
   - It's enforced in the service (422) **and** in the DB trigger.
   - The UI only mirrors it.
4. **Sewing data:** the SQL must contain `WHERE status = 'VERIFIED'` (or `'SEWING_IN_PROGRESS'` for the in-progress list).
   - Never filter in JS after fetching.
   - Ignore query params.
   - The sewing role gets 403 on `/api/orders*` reads.
5. **Audit trail:**
   - `verification_logs` is append-only.
   - `verification_items` is frozen outside PENDING_VERIFICATION.
   - Core order fields are frozen.
   - Triggers enforce all of this; don't weaken them.
6. **One gateway:**
   - Only REST Route Handlers read and write data.
   - No Server Actions.
   - No DB access in pages or components.
   - No `supabase-js`, no Supabase Auth, no anon or service keys.
   - No auth logic in middleware/proxy.
7. `src/domain/` is pure, shared logic: no server imports. Every file in `src/server/` starts with `import 'server-only'`.
8. **Inputs:**
   - Use strict zod schemas. **Never** `z.coerce.number()`, and never `Number()`/`parseInt()` on raw strings without the strict regex parsers.
   - Counts and quantities are integers. Fabric yards: > 0, at most 2 decimals.
   - Empty means uncounted. Empty is never 0.
9. **UI:**
   - Light theme only.
   - Explicit text and background colours on every input, select, option and textarea (inside `@layer base`).
   - No `type="number"`.
   - Status always shown with text + icon, not colour alone.
   - Visible labels and inline errors.
10. **Secrets and files:**
    - Secrets live only in env vars.
    - Never commit `.env*` (except `.env.example`), never print secret values, never commit the challenge PDF.
11. **Never run `npm run db:reset` (or any destructive SQL) against production** without the human's explicit confirmation in chat.

## Stack

Next.js 16.3 (App Router, TypeScript strict, Tailwind v4) · Supabase Postgres via Drizzle ORM + postgres.js (`prepare: false`) · zod · jose (JWT, httpOnly cookie `af_session`) · bcryptjs · TanStack Query · Vitest + PGlite (tests need no env or DB) · Vercel.

## Commands (some are created during P1)

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `npm run typecheck` | ESLint / `next typegen && tsc --noEmit` |
| `npm test` | `vitest run` (unit + integration on in-memory PGlite) |
| `npm run db:generate` | `drizzle-kit generate` |
| `npm run db:migrate` | `drizzle-kit migrate` (uses `DATABASE_URL_MIGRATIONS`, falling back to `DATABASE_URL`) |
| `npm run db:seed` | Idempotent seed (users, recipes, demo orders) |
| `npm run db:reset` | Truncate + seed; requires `--yes` and prints the target host |
| `npm run smoke -- --base=<url>` | Replays the evaluator's API attacks; prints PASS/FAIL |

## Key paths

- `src/domain/`: multiplier, traffic light, wastage, state machine, validation.
- `src/server/`: db, auth, http (errors, `withApi`), services.
- `src/app/api/**/route.ts`: thin handlers.
- `drizzle/`: migrations, including the custom integrity-guards migration.
- `tests/unit`, `tests/integration`, `tests/helpers`.
- `docs/AI_REVIEW_LOG.md`: running log of AI mistakes caught.
