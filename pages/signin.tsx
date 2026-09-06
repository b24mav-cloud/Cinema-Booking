import { FormEvent, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { SiteHeader } from "../components/SiteHeader";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const resetDone = router.query.reset === "1";
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch("/api/auth/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) return setError(typeof data === "string" ? data : data.error ?? "Unable to sign in.");
      router.push((router.query.next as string) || (data.user.role === "admin" ? "/admin" : "/account"));
    } catch {
      setError("The sign-in service is unavailable.");
    }
  };
  return <><Head><title>Sign in | CinemaBooking</title></Head><SiteHeader /><main className="auth-page shell"><form className="payment-card auth-card" onSubmit={submit}>
    <p className="kicker">YOUR ACCOUNT</p><h1>Welcome back.</h1>
    <p className="muted">Your account type sends you to the right portal automatically.</p>
    {resetDone && <p className="notice">Password updated. Sign in with your new password.</p>}
    <label className="field">Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
    <label className="field">Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label>
    <div className="field-row"><Link className="forgot-link" href="/forgot-password">Forgot password?</Link></div>
    {error && <p className="error">{error}</p>}
    <button className="button gold-button button-full">Sign in →</button>
    <p className="auth-foot muted">New here? <Link href="/signup">Create an account</Link></p>
  </form></main></>;
}