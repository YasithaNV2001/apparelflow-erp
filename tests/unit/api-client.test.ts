import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiFetch } from "@/lib/api-client";

function stubFetch(response: Response | Error): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends JSON with the session cookie and returns the parsed body", async () => {
    const fetchMock = stubFetch(Response.json({ user: { id: 1 } }));
    expect(await apiFetch("/api/auth/login", { method: "POST", body: { email: "a@b.test" } })).toEqual({
      user: { id: 1 },
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.test" }),
    });
  });

  it("returns undefined for 204 No Content", async () => {
    stubFetch(new Response(null, { status: 204 }));
    expect(await apiFetch("/api/auth/logout", { method: "POST" })).toBeUndefined();
  });

  it("throws the server's code, message and details", async () => {
    const details = [{ component: "Sleeve Cuffs", shortBy: 4 }];
    stubFetch(
      Response.json(
        { error: { code: "HARD_STOP_SHORTAGE", message: "1 component is short.", details } },
        { status: 422 },
      ),
    );
    await expect(apiFetch("/api/orders/1/approve", { method: "POST" })).rejects.toMatchObject({
      name: "ApiClientError",
      status: 422,
      code: "HARD_STOP_SHORTAGE",
      message: "1 component is short.",
      details,
    });
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    stubFetch(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(apiFetch("/api/orders")).rejects.toMatchObject({
      status: 502,
      code: "UNKNOWN_ERROR",
      message: "Something went wrong. Please try again.",
    });
  });

  it("reports a network failure as NETWORK_ERROR", async () => {
    stubFetch(new TypeError("fetch failed"));
    const error = await apiFetch("/api/orders").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });
});
