import "server-only";
import { z } from "zod";
import type { Role } from "../../domain/constants";
import { parseWholeNumber } from "../../domain/validation";
import { getUserFromRequest, type SessionUser } from "../auth/session";
import {
  ApiError,
  ForbiddenRoleError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
  errorResponse,
  fromDatabaseGuard,
  internalErrorResponse,
} from "./errors";

/** Who may call an endpoint: anyone, any signed-in user, or only the listed roles (PLAN §5.1). */
export type Access = "public" | "signed-in" | readonly [Role, ...Role[]];

type RouteParams = Record<string, string>;

/** The signature Next.js calls a route export with. Tests call it the same way. */
export type RouteHandler = (
  request: Request,
  context?: { params: Promise<RouteParams> },
) => Promise<Response>;

export interface ApiContext<A extends Access, S extends z.ZodType | undefined> {
  request: Request;
  /** Always from the verified session cookie, never from the request body (R26). */
  user: A extends "public" ? null : SessionUser;
  /** The parsed body: unknown keys stripped, types checked (D19). */
  body: S extends z.ZodType ? z.output<S> : undefined;
  params: RouteParams;
}

interface ApiOptions<A extends Access, S extends z.ZodType | undefined> {
  access: A;
  body?: S;
}

/**
 * The single gateway every /api/* route goes through (CLAUDE.md invariant 1, PLAN §4.4, D20).
 * Order: authenticate (401) → authorise the role (403) → validate the body (400) → run the handler,
 * whose service throws typed errors (404 / 409 / 422) → map every error to one JSON shape.
 */
export function withApi<const A extends Access, S extends z.ZodType | undefined = undefined>(
  options: ApiOptions<A, S>,
  handler: (context: ApiContext<A, S>) => Promise<Response>,
): RouteHandler {
  return async (request, routeContext) => {
    let user: SessionUser | null = null;
    try {
      user = await authenticate(request, options.access);
      const body = await parseBody(request, options.body);
      const params = (await routeContext?.params) ?? {};
      // The conditional types above are exactly what authenticate() and parseBody() guarantee.
      return await handler({ request, user, body, params } as ApiContext<A, S>);
    } catch (error) {
      return toErrorResponse(error, request, user);
    }
  };
}

/** Route ids must be positive whole numbers; anything else cannot exist, so 404 (PLAN §4.4). */
export function parseRouteId(params: RouteParams, name = "id"): number {
  const parsed = parseWholeNumber(params[name] ?? "");
  if (parsed.kind !== "number" || parsed.value <= 0) {
    throw new NotFoundError();
  }
  return parsed.value;
}

async function authenticate(request: Request, access: Access): Promise<SessionUser | null> {
  if (access === "public") {
    return null;
  }
  const user = await getUserFromRequest(request);
  if (!user) {
    throw new UnauthenticatedError();
  }
  if (access !== "signed-in" && !access.includes(user.role)) {
    throw new ForbiddenRoleError();
  }
  return user;
}

async function parseBody(request: Request, schema: z.ZodType | undefined): Promise<unknown> {
  if (!schema) {
    return undefined;
  }
  const result = schema.safeParse(await readJson(request));
  if (!result.success) {
    const { fieldErrors, formErrors } = z.flattenError(result.error);
    throw new ValidationError("Some fields are invalid.", {
      fields: fieldErrors,
      form: formErrors,
    });
  }
  return result.data;
}

/** An empty body counts as {}, so optional-only schemas accept it and required fields still fail. */
async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("The request body must be valid JSON.");
  }
}

function toErrorResponse(error: unknown, request: Request, user: SessionUser | null): Response {
  if (error instanceof ApiError) {
    return errorResponse(error);
  }
  const where = `[${request.method} ${new URL(request.url).pathname}]${user ? ` user=${user.id}` : ""}`;
  const guardError = fromDatabaseGuard(error);
  if (guardError) {
    // The service should have refused first; reaching the trigger means a service check is missing.
    console.warn(`${where} database guard refused the change`, error);
    return errorResponse(guardError);
  }
  console.error(`${where} unexpected error`, error);
  return internalErrorResponse();
}
