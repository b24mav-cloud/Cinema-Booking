import type { NextApiRequest, NextApiResponse } from "next";

export const json = (
  res: NextApiResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
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
      console.error(error);
      json(res, 500, { error: "Unexpected server error" });
    }
  };
}
