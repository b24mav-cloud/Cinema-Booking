import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Every handler should fail by throwing an HttpError so the response body is
 * always `{ error: string }`. `apiFetch` on the client relies on that shape.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly headers: Record<string, string>;

  constructor(status: number, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.headers = headers;
  }
}

export const json = (
  res: NextApiResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) => {
  res.statusCode = status;
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  // 204/304 must not carry a body or a Content-Type.
  if (res.statusCode === 204 || res.statusCode === 304) {
    res.removeHeader("Content-Type");
    res.end();
    return;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

export async function readBody<T = Record<string, unknown>>(req: NextApiRequest): Promise<Partial<T> | null> {
  const body = (req.body as Record<string, unknown> | undefined) ?? await readRawBody(req);
  return body as Partial<T> | null;
}

async function readRawBody<T = Record<string, unknown>>(req: NextApiRequest): Promise<Partial<T> | null> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    return null;
  }
}

export function wrap(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (res.writableEnded) return;
      if (error instanceof HttpError) {
        json(res, error.status, { error: error.message }, error.headers);
        return;
      }
      console.error(error);
      json(res, 500, { error: "Unexpected server error" });
    }
  };
}
