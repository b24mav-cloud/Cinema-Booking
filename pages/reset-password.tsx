import { FormEvent, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { SiteHeader } from "../components/SiteHeader";
import { PASSWORD_RULES } from "../lib/auth-policy";

export default function ResetPassword() {
  const router = useRouter();
  const tokenHash = typeof router.query.token_hash === "string" ? router.query.token_hash : "";
  const type = typeof router.query.type === "string" ? router.query.type : "recovery";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const touched = password.length > 0;
  const shared = confirm.length > 0 && confirm === password;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (confirm !== password) return setError("Passwords do not match.");
    if (!tokenHash) return setError("This reset link is invalid or has expired.");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokenHash, type, password }) });
      const data = await response.json();
      if (!response.ok) return setError(typeof data === "string" ? data : data.error ?? "We couldn't reset your password.");
      router.push("/signin?reset=1");
    } catch {
      setError("The password-reset service is unavailable.");
    } finally {
      setBusy(false);
    }
  };
  return <><Head><title>Reset password | CinemaBooking</title></Head><SiteHeader /><main className="auth-page shell">{!tokenHash
    ? <div className="payment-card auth-card"><p className="kicker">YOUR ACCOUNT</p><h1>Link expired.</h1><p className="muted">This reset link is invalid or has already been used. Request a fresh one and try again.</p><Link className="button gold-button button-full" href="/forgot-password">Request a new link →</Link><p className="auth-foot muted">Back to <Link href="/signin">sign in</Link></p></div>
    : <form className="payment-card auth-card" onSubmit={submit}><p className="kicker">YOUR ACCOUNT</p><h1>Set a new password.</h1><p className="muted">Choose a fresh one and you'll be signed back in.</p><label className="field">New password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" minLength={8} /></label>{touched && <ul className="password-checks" aria-label="Password requirements">{PASSWORD_RULES.map(rule => { const ok = rule.test(password); return <li className={ok ? "met" : ""} key={rule.key}><span>{ok ? "✓" : "·"}</span>{rule.label}</li>; })}</ul>}<label className="field">Confirm new password<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" /></label>{confirm.length > 0 && <p className={`match${shared ? " ok" : ""}`}>{shared ? "Passwords match." : "Passwords do not match."}</p>}{error && <p className="error">{error}</p>}<button className="button gold-button button-full" type="submit" disabled={busy}>{busy ? "Updating password…" : "Update password →"}</button></form>}</main></>;
}