// Browser-side access to our REST API (PLAN D2): every read and write in the UI goes through here.

const NO_CONTENT = 204;
const NETWORK_FAILURE_STATUS = 0;
const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const NETWORK_MESSAGE = "Could not reach the server. Check your connection and try again.";

/** A failed API call, carrying the server's stable error code and details (PLAN §7.1). */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
}

/** Calls our API with the session cookie and returns the JSON body, or throws ApiClientError. */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const response = await send(path, options);
  if (response.status === NO_CONTENT) {
    return undefined as T;
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (payload as ErrorBody | null)?.error;
    throw new ApiClientError(
      response.status,
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? GENERIC_MESSAGE,
      error?.details,
    );
  }
  return payload as T;
}

async function send(path: string, { method = "GET", body }: ApiFetchOptions): Promise<Response> {
  try {
    return await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError(NETWORK_FAILURE_STATUS, "NETWORK_ERROR", NETWORK_MESSAGE);
  }
}
