export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type FailurePayload = { error?: unknown };

/** Pulls a human-readable message out of whatever the handler returned. */
function messageFrom(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const candidate = (payload as FailurePayload).error;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  if (typeof payload === "string" && payload.trim() && payload.length < 300) return payload;
  return `Something went wrong (${status}). Please try again.`;
}

/**
 * Single fetch entry point for the browser. Unwraps the `{ error }` body that
 * every API handler returns so callers can `catch (e) { setError(e.message) }`
 * instead of rendering raw JSON at the user.
 */
export async function apiFetch<T>(input: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers as Record<string, string> | undefined) };
  if (init.body !== undefined && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(input, { ...init, headers });
  } catch {
    throw new ApiError("We couldn't reach the server. Check your connection and try again.", 0);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) throw new ApiError(messageFrom(payload, response.status), response.status);
  return payload as T;
}

export const apiPost = <T>(input: string, body?: unknown, init: RequestInit = {}) =>
  apiFetch<T>(input, { ...init, method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const apiPatch = <T>(input: string, body?: unknown) =>
  apiFetch<T>(input, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });

export const apiDelete = <T>(input: string, body?: unknown) =>
  apiFetch<T>(input, { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) });

/** Turns any thrown value into a message safe to show a user. */
export const errorMessage = (error: unknown, fallback = "Something went wrong."): string =>
  error instanceof Error && error.message ? error.message : fallback;