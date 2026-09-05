import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const cookieName = "cinema_session";
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && publishableKey
  ? createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const parseCookies = header => Object.fromEntries((header ?? "").split(";").map(item => {
  const separator = item.indexOf("=");
  return separator < 0 ? [] : [item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1).trim())];
}).filter(item => item.length));

const sessionCookie = session => Buffer.from(JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token
})).toString("base64url");

export const clearSession = res => {
  res.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
};

export const setSession = (res, session) => {
  res.setHeader("Set-Cookie", `${cookieName}=${sessionCookie(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(60, session.expires_in ?? 3600)}`);
};

export const getSessionUser = async (req, res) => {
  if (!supabase) return null;
  const raw = parseCookies(req.headers.cookie)[cookieName];
  if (!raw) return null;
  let session;
  try {
    session = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    clearSession(res);
    return null;
  }
  let result = await supabase.auth.getUser(session.access_token);
  if (result.error && session.refresh_token) {
    const refreshed = await supabase.auth.refreshSession({ refresh_token: session.refresh_token });
    if (refreshed.data.session) {
      setSession(res, refreshed.data.session);
      result = await supabase.auth.getUser(refreshed.data.session.access_token);
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
    role: user.app_metadata?.role === "admin" || user.user_metadata?.role === "admin" ? "admin" : "customer",
    metadata: user.user_metadata ?? {}
  };
};

export const requireUser = async (req, res, role) => {
  const user = await getSessionUser(req, res);
  if (!user) return { error: "Authentication required.", status: 401 };
  if (role && user.role !== role) return { error: "You are not authorized to access this resource.", status: 403 };
  return { user };
};

export const signIn = async (email, password) => {
  if (!supabase) throw new Error("Supabase authentication is not configured.");
  return supabase.auth.signInWithPassword({ email, password });
};

export const isAuthConfigured = () => Boolean(supabase);
