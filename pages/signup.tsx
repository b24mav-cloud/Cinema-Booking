import { FormEvent, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { SiteHeader } from "../components/SiteHeader";
import { PASSWORD_RULES } from "../lib/auth-policy";

export default function SignUp() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const touched = password.length > 0;
  const shared = confirm.length > 0 && confirm === password;
  const valid = touched ? PASSWORD_RULES.filter(rule => rule.test(password)).length : 0;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (confirm !== password) return setError("Passwords do not match.");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password }) });
      const data = await response.json();
      if (!response.ok) return setError(typeof data === "string" ? data : data.error ?? "Unable to create your account.");
      router.push((router.query.next as string) || "/account");
    } catch {
      setError("The sign-up service is unavailable.");
    } finally {
      setBusy(false);
    }
  };
  return <><Head><title>Create an account | CinemaBooking</title></Head><SiteHeader /><main className="auth-page shell"><form className="payment-card auth-card" onSubmit={submit}>
    <p className="kicker">YOUR ACCOUNT</p><h1>Join in.</h1>
    <p className="muted">One account for your tickets, receipts, and film-night history.</p>
    <label className="field">Your name<input type="text" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" placeholder="Jamie Reyes" /></label>
    <label className="field">Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" /></label>
    <label className="field">Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" minLength={8} /></label>
    {touched && <ul className="password-checks" aria-label="Password requirements">{PASSWORD_RULES.map(rule => { const ok = rule.test(password); return <li className={ok ? "met" : ""} key={rule.key}><span>{ok ? "✓" : "·"}</span>{rule.label}</li>; })}</ul>}
    {touched && <p className="password-strength"><span style={{ width: `${(valid / PASSWORD_RULES.length) * 100}%`, opacity: valid / PASSWORD_RULES.length }} /></p>}
    <label className="field">Confirm password<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" /></label>
    {confirm.length > 0 && <p className={`match${shared ? " ok" : ""}`}>{shared ? "Passwords match." : "Passwords do not match."}</p>}
    {error && <p className="error">{error}</p>}
    <button className="button gold-button button-full" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account →"}</button>
    <p className="auth-foot muted">Already have an account? <Link href="/signin">Sign in</Link></p>
  </form></main></>;
}