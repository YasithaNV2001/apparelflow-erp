import type { Role } from "../src/domain/constants";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/domain/demo-accounts";
import type { OrderDto, RecipeDto, SewingOrderDto } from "../src/lib/api-types";

// Usage: npm run smoke -- --base=https://<your-app>.vercel.app
// Replays the evaluator's API attacks against a running deployment and prints PASS/FAIL (PLAN §9.5).
// It creates one order of its own and approves it, so run it before the final production reset.

interface Check {
  name: string;
  expected: string;
  actual: string;
  pass: boolean;
}

interface ApiResult {
  status: number;
  json: unknown;
}

const checks: Check[] = [];

/** One signed-in (or anonymous) caller; it keeps the session cookie the API sets. */
class Caller {
  private cookie = "";

  constructor(private readonly base: string) {}

  async call(method: string, path: string, body?: unknown): Promise<ApiResult> {
    const headers = new Headers();
    if (this.cookie) {
      headers.set("cookie", this.cookie);
    }
    if (body !== undefined) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
    if (cookies.length > 0) {
      this.cookie = cookies.join("; ");
    }
    const text = await response.text();
    return { status: response.status, json: text ? safeJson(text) : null };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorCode(json: unknown): string | undefined {
  if (typeof json !== "object" || json === null || !("error" in json)) {
    return undefined;
  }
  const { error } = json as { error: { code?: unknown } };
  return typeof error.code === "string" ? error.code : undefined;
}

function record(name: string, expected: string, actual: string, pass: boolean): void {
  checks.push({ name, expected, actual, pass });
}

/** Records whether the response has the expected status (and error code, when given). */
async function expectStatus(
  name: string,
  expected: number,
  request: Promise<ApiResult>,
  expectedCode?: string,
): Promise<ApiResult> {
  const result = await request;
  const code = errorCode(result.json);
  const pass = result.status === expected && (expectedCode === undefined || code === expectedCode);
  record(name, [expected, expectedCode].filter(Boolean).join(" "), [result.status, code].filter(Boolean).join(" "), pass);
  return result;
}

async function signIn(base: string, role: Role): Promise<Caller> {
  const account = DEMO_ACCOUNTS.find((candidate) => candidate.role === role);
  if (!account) {
    throw new Error(`No demo account for ${role}`);
  }
  const caller = new Caller(base);
  const login = { email: account.email, password: DEMO_PASSWORD };
  await expectStatus(`Sign in as ${role}`, 200, caller.call("POST", "/api/auth/login", login));
  return caller;
}

function targetBase(): string {
  const argument = process.argv.find((value) => value.startsWith("--base="));
  if (!argument) {
    throw new Error("Usage: npm run smoke -- --base=https://<your-app>.vercel.app");
  }
  return new URL(argument.slice("--base=".length)).origin;
}

async function main(): Promise<void> {
  const base = targetBase();
  console.log(`Smoke test against ${base} (creates and approves one order)\n`);
  const anonymous = new Caller(base);
  await expectStatus("Health check", 200, anonymous.call("GET", "/api/health"));

  const supervisor = await signIn(base, "cutting_supervisor");
  const verifier = await signIn(base, "cutting_verifier");
  const sewing = await signIn(base, "sewing_supervisor");

  // A fresh order of our own, so the demo orders are never touched.
  const { recipes } = (await supervisor.call("GET", "/api/recipes")).json as { recipes: RecipeDto[] };
  const blouse = recipes.find((recipe) => recipe.code === "REC-BL01");
  if (!blouse) {
    throw new Error("Recipe REC-BL01 not found; is the database seeded?");
  }
  const created = await expectStatus(
    "Supervisor creates and submits an order",
    201,
    supervisor.call("POST", "/api/orders", {
      recipeId: blouse.id,
      targetQty: 10,
      fabricRollId: `SMOKE-${Date.now().toString(36).toUpperCase()}`,
      actualFabricYds: 18.5,
      submitForVerification: true,
    }),
  );
  const { order } = created.json as { order: OrderDto };
  const orderPath = `/api/orders/${order.id}`;
  const exact = order.items.map((item) => ({ componentId: item.componentId, actualQty: item.expectedQty }));
  const lastIndex = exact.length - 1;
  const short = exact.map((entry, index) => (index === lastIndex ? { ...entry, actualQty: entry.actualQty - 1 } : entry));

  await expectStatus("Approve without a session", 401, anonymous.call("POST", `${orderPath}/approve`, {}), "UNAUTHENTICATED");
  await expectStatus("Cutting supervisor approves", 403, supervisor.call("POST", `${orderPath}/approve`, {}), "FORBIDDEN_ROLE");
  await expectStatus("Sewing supervisor approves", 403, sewing.call("POST", `${orderPath}/approve`, {}), "FORBIDDEN_ROLE");
  await expectStatus(
    "Approve with one component short",
    422,
    verifier.call("POST", `${orderPath}/approve`, { items: short }),
    "HARD_STOP_SHORTAGE",
  );
  await expectStatus(
    "Approve with a component missing",
    422,
    verifier.call("POST", `${orderPath}/approve`, { items: exact.slice(1) }),
    "HARD_STOP_MISSING_COMPONENTS",
  );
  await expectStatus(
    "Reject with a blank note",
    400,
    verifier.call("POST", `${orderPath}/reject`, { rejectionNote: "   " }),
    "VALIDATION_ERROR",
  );

  // Every refusal must leave the order exactly as it was.
  const { order: afterRefusals } = (await verifier.call("GET", orderPath)).json as { order: OrderDto };
  const counted = afterRefusals.items.filter((item) => item.actualQty !== null).length;
  record(
    "Order untouched by the refusals",
    "PENDING_VERIFICATION, 0 counted",
    `${afterRefusals.status}, ${counted} counted`,
    afterRefusals.status === "PENDING_VERIFICATION" && counted === 0,
  );

  await expectStatus("Approve with every count exact", 200, verifier.call("POST", `${orderPath}/approve`, { items: exact }));
  const queue = await expectStatus(
    "Sewing queue, called with ?status=PENDING_VERIFICATION&all=true",
    200,
    sewing.call("GET", "/api/sewing/queue?status=PENDING_VERIFICATION&all=true"),
  );
  const queued = (queue.json as { orders: SewingOrderDto[] }).orders;
  const statuses = [...new Set(queued.map((queuedOrder) => queuedOrder.status))];
  record("Sewing queue holds only verified orders", "VERIFIED", statuses.join(", ") || "(empty)", statuses.every((status) => status === "VERIFIED"));
  record(
    "The approved order reached the sewing queue",
    order.orderNo,
    queued.some((queuedOrder) => queuedOrder.id === order.id) ? order.orderNo : "missing",
    queued.some((queuedOrder) => queuedOrder.id === order.id),
  );
  await expectStatus(
    "Approve the same order again",
    409,
    verifier.call("POST", `${orderPath}/approve`, { items: exact }),
    "INVALID_STATE",
  );
  await expectStatus("Sewing supervisor reads the order directly", 403, sewing.call("GET", orderPath), "FORBIDDEN_ROLE");
}

function printReport(): void {
  const width = Math.max(...checks.map((check) => check.name.length));
  for (const [index, check] of checks.entries()) {
    const number = String(index + 1).padStart(2);
    const verdict = check.pass ? "PASS" : "FAIL";
    console.log(`${number}  ${verdict}  ${check.name.padEnd(width)}  expected ${check.expected}, got ${check.actual}`);
  }
  const failed = checks.filter((check) => !check.pass).length;
  console.log(`\n${checks.length - failed} passed, ${failed} failed`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (checks.length > 0) {
      printReport();
    }
    if (checks.some((check) => !check.pass)) {
      process.exitCode = 1;
    }
  });
