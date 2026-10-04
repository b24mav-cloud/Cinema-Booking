import { useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
import { apiFetch, errorMessage } from "../../lib/api/client";
import { peso } from "../../lib/types";
import type { ValidationResult, ValidationState } from "../../pages/api/admin/bookings/validate";

const toneFor = (state: ValidationState) =>
  state === "ok" ? "ok" : state === "not-found" ? "warn" : "bad";

const TONE_COPY: Record<ValidationState, string> = {
  ok: "Admit",
  "already-used": "Already admitted",
  cancelled: "Cancelled booking",
  refunded: "Refunded booking",
  ended: "Show ended",
  "not-found": "Unknown code"
};

export default function CheckIn() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [recent, setRecent] = useState<{ id: string; movieTitle: string; auditorium: string; seats: string; userEmail: string; checkedInAt: string | null }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const result = await apiFetch<{ bookings: typeof recent }>("/api/admin/bookings/validate?query=");
      setRecent(result.bookings.slice(0, 8));
    } catch {
      // The validator still works without the recent list.
    }
  }, []);

  useEffect(() => { void loadRecent(); }, [loadRecent]);

  const validate = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setChecking(true);
    try {
      const response = await apiFetch<ValidationResult>("/api/admin/bookings/validate", {
        method: "POST",
        body: JSON.stringify({ code: trimmed })
      });
      setResult(response);
      setCode("");
      await loadRecent();
    } catch (err) {
      // A 404 means the code matched nothing; show that as a scan result.
      const status = (err as { status?: number }).status;
      if (status === 404) {
        setResult({ state: "not-found", message: errorMessage(err, "No ticket matches that code.") });
      } else {
        setResult({ state: "not-found", message: errorMessage(err, "Could not check that ticket.") });
      }
    } finally {
      setChecking(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      <Head>
        <title>Check-in | CinemaBooking Admin</title>
        <meta name="robots" content="noindex" />
      </Head>
      <SiteHeader admin />

      <main className="shell checkin-page">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/admin">Dashboard</Link> <span aria-hidden="true">/</span> <span aria-current="page">Check-in</span>
        </nav>

        <div className="section-heading">
          <div>
            <p className="kicker">DOOR STAFF</p>
            <h1>Ticket check-in</h1>
            <p className="section-intro">Scan a guest's QR code, or type their confirmation code.</p>
          </div>
        </div>

        <form className="checkin-form" onSubmit={validate}>
          <label className="field">
            Ticket code
            <input
              ref={inputRef}
              type="text"
              value={code}
              onChange={event => setCode(event.target.value.toUpperCase())}
              placeholder="CB-XXXXXXXXXXXXXXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-describedby="checkin-hint"
            />
          </label>
          <button className="button gold-button" type="submit" disabled={checking || !code.trim()}>
            {checking ? "Checking…" : "Check ticket"}
          </button>
        </form>
        <p className="muted" id="checkin-hint">Codes start with <code>CB-</code>. A confirmation number like <code>#A1B2C3D4</code> also works.</p>

        {result && (
          <div className={`checkin-result ${toneFor(result.state)}`} role="alert" aria-live="assertive">
            <p className="kicker">{TONE_COPY[result.state]}</p>
            <h2>{result.message}</h2>
            {result.booking && (
              <dl className="checkin-detail">
                <div><dt>Film</dt><dd>{result.booking.movieTitle}</dd></div>
                <div><dt>Guest</dt><dd>{result.booking.userEmail}</dd></div>
                <div><dt>Seats</dt><dd>{result.booking.seats}</dd></div>
                <div><dt>Hall</dt><dd>{result.booking.auditorium}</dd></div>
                <div><dt>Paid</dt><dd>{peso(result.booking.totalAmount)} via {result.booking.paymentMethod}</dd></div>
              </dl>
            )}
          </div>
        )}

        <section className="checkin-recent">
          <div className="section-heading">
            <div>
              <p className="kicker">RECENT ACTIVITY</p>
              <h2>Latest bookings</h2>
            </div>
          </div>
          {recent.length === 0 ? (
            <p className="muted">No bookings yet.</p>
          ) : (
            <div className="account-list">
              {recent.map(item => (
                <div className="account-booking history-item" key={item.id}>
                  <div>
                    <h2>{item.movieTitle}</h2>
                    <p className="muted">{item.userEmail} · {item.auditorium} · {item.seats}</p>
                  </div>
                  <div className="history-actions">
                    {item.checkedInAt
                      ? <span className="status-badge showing">Admitted</span>
                      : <button type="button" className="button" onClick={() => setCode(item.id.slice(0, 8).toUpperCase())}>Use code</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="wizard-actions">
          <button className="button back-button" onClick={() => router.push("/admin")}>← Back to dashboard</button>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}