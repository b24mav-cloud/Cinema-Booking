import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import type { AuthUser } from "../types";

type SessionPayload = { access_token: string; refresh_token: string };

let supabase: SupabaseClient | null | undefined;

export function getSupabase() {
  if (supabase !== undefined) return supabase;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return (supabase = null);
  supabase = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return supabase;
}

let admin: SupabaseClient | null | undefined;

export function getAdminClient() {
  if (admin !== undefined) return admin;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return (admin = null);
  admin = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return admin;
}

const cookieName = "cinema_session";

// Shorter idle timeout for admins, who can modify cinema data.
const SESSION_IDLE_SECONDS: Record<"admin" | "customer", number> = {
  admin: 20 * 60,
  customer: 30 * 24 * 60 * 60
};

const parseCookies = (header: string | undefined) =>
  Object.fromEntries(
    (header ?? "")
      .split(";")
      .map(item => {
        const separator = item.indexOf("=");
        return separator < 0 ? [] : [item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1).trim())];
      })
      .filter(item => item.length)
  );

const sessionCookie = (session: { access_token: string; refresh_token: string }) =>
  Buffer.from(JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token })).toString("base64url");

export const clearSession = (res: NextApiResponse) => {
  res.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
};

export const setSession = (res: NextApiResponse, session: { access_token: string; refresh_token: string; expires_in?: number }, role: "admin" | "customer" = "customer") => {
  res.setHeader("Set-Cookie", `${cookieName}=${sessionCookie(session)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_IDLE_SECONDS[role]}`);
};

const roleOf = (user: { app_metadata?: Record<string, unknown> | null; user_metadata?: Record<string, unknown> | null }): "admin" | "customer" =>
  user.app_metadata?.role === "admin" || user.user_metadata?.role === "admin" ? "admin" : "customer";

export const getSessionUser = async (req: NextApiRequest, res: NextApiResponse): Promise<AuthUser | null> => {
  const client = getSupabase();
  if (!client) return null;
  const raw = parseCookies(req.headers.cookie)[cookieName];
  if (!raw) return null;
  let session: SessionPayload;
  try {
    session = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    clearSession(res);
    return null;
  }
  let result = await client.auth.getUser(session.access_token);
  if (result.error && session.refresh_token) {
    const refreshed = await client.auth.refreshSession({ refresh_token: session.refresh_token });
    if (refreshed.data.session) {
      setSession(res, refreshed.data.session, roleOf(refreshed.data.session.user));
      result = await client.auth.getUser(refreshed.data.session.access_token);
    }
  }
  if (result.error || !result.data.user) {
    clearSession(res);
    return null;
  }
  const user = result.data.user;
  return {
    id: user.id,
    email: user.email ?? "",
    role: roleOf(user),
    metadata: user.user_metadata ?? {}
  };
};

export const requireUser = async (
  req: NextApiRequest,
  res: NextApiResponse,
  role?: "admin" | "customer"
): Promise<{ error: string; status: number; user?: undefined } | { user: AuthUser; error?: undefined; status?: undefined }> => {
  const user = await getSessionUser(req, res);
  if (!user) return { error: "Authentication required.", status: 401 };
  if (role && user.role !== role) return { error: "You are not authorized to access this resource.", status: 403 };
  return { user };
};

export const signIn = async (email: string, password: string) => {
  const client = getSupabase();
  if (!client) throw new Error("Supabase authentication is not configured.");
  return client.auth.signInWithPassword({ email, password });
};

export const isAuthConfigured = () => Boolean(getSupabase());
