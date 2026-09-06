import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabase, setSession } from "../../../lib/api/auth";
import { passwordErrors } from "../../../lib/auth-policy";
import { json, readBody, wrap } from "../../../lib/api/respond";

const roleOf = (user: { app_metadata?: Record<string, unknown> | null; user_metadata?: Record<string, unknown> | null }): "admin" | "customer" =>
  user.app_metadata?.role === "admin" || user.user_metadata?.role === "admin" ? "admin" : "customer";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") return json(res, 404, { error: "Not found" });
  const input = await readBody<{ tokenHash?: string; type?: string; password?: string }>(req);
  const tokenHash = input?.tokenHash?.trim() ?? "";
  const type = input?.type?.trim() === "email" ? "email" : "recovery";
  const password = input?.password ?? "";
  if (!tokenHash) return json(res, 400, { error: "This reset link is invalid or has expired." });
  const issues = passwordErrors(password);
  if (issues.length) return json(res, 400, { error: "Password does not meet the requirements.", issues });
  const client = getSupabase();
  if (!client) return json(res, 503, "Password reset is not configured.");
  // Recovery tokens are single-use: verifyOtp consumes them, so a replayed link fails.
  const verified = await client.auth.verifyOtp({ token_hash: tokenHash, type });
  if (verified.error || !verified.data.session) return json(res, 400, { error: "This reset link is invalid, expired, or has already been used." });
  const updated = await client.auth.updateUser({ password });
  if (updated.error || !updated.data.user) return json(res, 502, "We couldn't reset your password. Please try again.");
  setSession(res, verified.data.session, roleOf(updated.data.user));
  return json(res, 200, { ok: true });
});