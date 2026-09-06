import type { NextApiRequest, NextApiResponse } from "next";
import { isAuthConfigured, setSession, signIn } from "../../../lib/api/auth";
import { checkRateLimit, clientIp } from "../../../lib/api/rate-limit";
import { json, readBody, wrap } from "../../../lib/api/respond";

const FAIL_LIMIT = 5;
const IP_LIMIT = 60;
const WINDOW_MS = 15 * 60 * 1000;

const roleOf = (user: { app_metadata?: Record<string, unknown> | null; user_metadata?: Record<string, unknown> | null }): "admin" | "customer" =>
  user.app_metadata?.role === "admin" || user.user_metadata?.role === "admin" ? "admin" : "customer";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") return json(res, 404, { error: "Not found" });
  const input = await readBody<{ email?: string; password?: string }>(req);
  if (!input?.email?.trim() || !input?.password) return json(res, 400, "Email and password are required.");
  if (!isAuthConfigured()) {
    return json(res, 503, "Supabase authentication is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY before starting the server.");
  }
  const email = input.email.trim().toLowerCase();
  const ip = clientIp(req);
  const ipLimit = checkRateLimit(`signin-ip:${ip}`, IP_LIMIT, WINDOW_MS);
  if (!ipLimit.ok) return json(res, 429, { error: "Too many attempts. Please wait a few minutes and try again." }, { "Retry-After": String(ipLimit.retryAfter) });
  const keyLimit = checkRateLimit(`signin:${email}:${ip}`, FAIL_LIMIT, WINDOW_MS);
  if (!keyLimit.ok) return json(res, 429, { error: "Too many attempts. Please wait a few minutes and try again." }, { "Retry-After": String(keyLimit.retryAfter) });
  let result;
  try {
    result = await signIn(email, input.password);
  } catch (error) {
    console.error("Supabase sign-in failed:", error);
    return json(res, 502, "Supabase could not be reached. Check the Supabase URL, anon key, and network connection.");
  }
  // Single generic error — never reveals whether the email exists or the
  // password was wrong.
  if (result.error || !result.data.session) return json(res, 401, { error: "Incorrect email or password." });
  const user = result.data.user;
  const role = roleOf(user);
  setSession(res, result.data.session, role);
  return json(res, 200, { user: { id: user.id, email: user.email ?? "", role } });
});