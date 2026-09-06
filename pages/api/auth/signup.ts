import type { NextApiRequest, NextApiResponse } from "next";
import { getAdminClient, getSupabase, setSession } from "../../../lib/api/auth";
import { isEmail, passwordErrors } from "../../../lib/auth-policy";
import { checkRateLimit, clientIp } from "../../../lib/api/rate-limit";
import { json, readBody, wrap } from "../../../lib/api/respond";

const SIGNUP_LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") return json(res, 404, { error: "Not found" });
  const input = await readBody<{ name?: string; email?: string; password?: string }>(req);
  const name = input?.name?.trim() ?? "";
  const email = input?.email?.trim().toLowerCase() ?? "";
  const password = input?.password ?? "";
  if (!name) return json(res, 400, { error: "Your name is required." });
  if (!isEmail(email)) return json(res, 400, { error: "Enter a valid email address." });
  const issues = passwordErrors(password);
  if (issues.length) return json(res, 400, { error: "Password does not meet the requirements.", issues });
  const limit = checkRateLimit(`signup:${clientIp(req)}`, SIGNUP_LIMIT, WINDOW_MS);
  if (!limit.ok) return json(res, 429, { error: "Too many sign-ups from this address. Try again later." }, { "Retry-After": String(limit.retryAfter) });
  const admin = getAdminClient();
  const client = getSupabase();
  if (!admin || !client) return json(res, 503, "Account creation is not configured. Set SUPABASE_SERVICE_ROLE_KEY before starting the server.");
  // Customer-only, self-serve: role is assigned server-side and can never be
  // supplied by the client. Admin accounts are provisioned separately.
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: "customer" },
    app_metadata: { role: "customer" }
  });
  if (created.error) {
    if (/already registered|already been registered|User already registered/i.test(created.error.message)) {
      return json(res, 409, { error: "An account with that email already exists." });
    }
    console.error("Supabase sign-up failed:", created.error.message);
    return json(res, 502, "We couldn't create your account right now. Please try again.");
  }
  const auto = await client.auth.signInWithPassword({ email, password });
  if (auto.error || !auto.data.session) {
    return json(res, 201, { user: { id: created.data.user.id, email, role: "customer", name }, requiresSignIn: true });
  }
  setSession(res, auto.data.session, "customer");
  return json(res, 201, { user: { id: created.data.user.id, email, role: "customer", name } });
});