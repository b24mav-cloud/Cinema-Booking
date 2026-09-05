import type { NextApiRequest, NextApiResponse } from "next";
import { isAuthConfigured, setSession, signIn } from "../../../lib/api/auth";
import { json, readBody, wrap } from "../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") return json(res, 404, { error: "Not found" });
  const input = await readBody<{ email?: string; password?: string }>(req);
  if (!input?.email?.trim() || !input?.password) return json(res, 400, "Email and password are required.");
  if (!isAuthConfigured()) {
    return json(res, 503, "Supabase authentication is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY before starting the server.");
  }
  let result;
  try {
    result = await signIn(input.email.trim(), input.password);
  } catch (error) {
    console.error("Supabase sign-in failed:", error);
    return json(res, 502, "Supabase could not be reached. Check the Supabase URL, publishable key, and network connection.");
  }
  if (result.error || !result.data.session) return json(res, 401, result.error?.message ?? "Unable to sign in.");
  setSession(res, result.data.session);
  const signedInUser = result.data.user;
  return json(res, 200, {
    user: {
      id: signedInUser.id,
      email: signedInUser.email ?? "",
      role: signedInUser.app_metadata?.role === "admin" || signedInUser.user_metadata?.role === "admin" ? "admin" : "customer"
    }
  });
});