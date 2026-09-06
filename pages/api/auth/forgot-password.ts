import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabase } from "../../../lib/api/auth";
import { isEmail } from "../../../lib/auth-policy";
import { checkRateLimit } from "../../../lib/api/rate-limit";
import { json, readBody, wrap } from "../../../lib/api/respond";

const RESET_LIMIT = 3;
const WINDOW_MS = 15 * 60 * 1000;

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") return json(res, 404, { error: "Not found" });
  const input = await readBody<{ email?: string }>(req);
  if (!isEmail(input?.email ?? "")) return json(res, 400, { error: "Enter a valid email address." });
  const email = input!.email!.trim().toLowerCase();
  const limit = checkRateLimit(`forgot:${email}`, RESET_LIMIT, WINDOW_MS);
  if (!limit.ok) return json(res, 429, { error: "Too many requests. Please wait a few minutes and try again." }, { "Retry-After": String(limit.retryAfter) });
  const client = getSupabase();
  if (client) {
    const base = req.headers.origin ?? `http://${req.headers.host ?? "localhost:3000"}`;
    try {
      await client.auth.resetPasswordForEmail(email, { redirectTo: `${base}/reset-password` });
    } catch (error) {
      // Never reveal whether the account exists.
      console.error("Forgot-password request failed:", error);
    }
  }
  return json(res, 200, { ok: true });
});