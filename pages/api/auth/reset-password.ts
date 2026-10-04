import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabase, roleOf, setSession } from "../../../lib/api/auth";
import { passwordErrors } from "../../../lib/auth-policy";
import { HttpError, json, readBody, wrap } from "../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") throw new HttpError(404, "Not found");
  const input = await readBody<{ tokenHash?: string; type?: string; password?: string }>(req);
  const tokenHash = input?.tokenHash?.trim() ?? "";
  const type = input?.type?.trim() === "email" ? "email" : "recovery";
  const password = input?.password ?? "";
  if (!tokenHash) throw new HttpError(400, "This reset link is invalid or has expired.");
  const issues = passwordErrors(password);
  if (issues.length) throw new HttpError(400, `Password does not meet the requirements: ${issues.join(", ")}.`);
  const client = getSupabase();
  if (!client) throw new HttpError(503, "Password reset is not configured.");
  // Recovery tokens are single-use: verifyOtp consumes them, so a replayed link fails.
  const verified = await client.auth.verifyOtp({ token_hash: tokenHash, type });
  if (verified.error || !verified.data.session) throw new HttpError(400, "This reset link is invalid, expired, or has already been used.");
  const updated = await client.auth.updateUser({ password });
  if (updated.error || !updated.data.user) throw new HttpError(502, "We couldn't reset your password. Please try again.");
  setSession(res, verified.data.session, roleOf(updated.data.user));
  return json(res, 200, { ok: true });
});