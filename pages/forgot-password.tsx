import { FormEvent, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { SiteHeader } from "../components/SiteHeader";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) return setError(typeof data === "string" ? data : data.error ?? "Unable to send a reset link.");
      setSent(true);
    } catch {
      setError("The password-reset service is unavailable.");
    }
  };
  return <><Head><title>Forgot password | CinemaBooking</title></Head><SiteHeader /><main className="auth-page shell">{sent
    ? <div className="payment-card auth-card"><p className="kicker">YOUR ACCOUNT</p><h1>Check your inbox.</h1><p className="muted">If an account exists for <strong>{email}</strong>, a reset link is on its way. Links expire after a short time and can only be used once.</p><Link className="button gold-button button-full" href="/signin">Back to sign in →</Link><p className="auth-foot muted">Didn't arrive? <Link href="/forgot-password">Try again</Link></p></div>
    : <form className="payment-card auth-card" onSubmit={submit}><p className="kicker">YOUR ACCOUNT</p><h1>Forgot password?</h1><p className="muted">Enter the email on your account and we'll send a reset link.</p><label className="field">Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" /></label>{error && <p className="error">{error}</p>}<button className="button gold-button button-full">Send reset link →</button><p className="auth-foot muted">Just remembered? <Link href="/signin">Sign in</Link></p></form>}</main></>;
}