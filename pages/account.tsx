import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";
import { QrTicket } from "../components/QrTicket";
import { apiDelete, apiFetch, apiPost, errorMessage } from "../lib/api/client";
import { bookingStatus, isCancellable } from "../lib/booking";
import { peso } from "../lib/types";
import type { Booking, BookingStatus } from "../lib/types";

type TicketBooking = Booking & {
  ticketCode: string;
  showtime: {
    startTime: string;
    endTime?: string;
    experience?: string;
    movie?: { id: number; title: string; posterUrl?: string } | null;
  } | null;
};

type WatchlistResponse = {
  ids: number[];
  movies: { id: number; title: string; posterUrl: string; status?: string; releaseDate?: string | null }[];
};
type Profile = { name: string; mobile: string; paymentPrefs: string[] };

const PAYMENT_METHODS = ["GCash", "Maya", "Card"];
const PAYMENT_ICONS: Record<string, string> = { GCash: "🇵🇭", Maya: "💳", Card: "💳" };

const TABS = [
  ["tickets", "My Tickets"],
  ["history", "Booking History"],
  ["watchlist", "Saved Watchlist"],
  ["profile", "Profile"]
] as const;

type Tab = (typeof TABS)[number][0];

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  cancelled: "Cancelled",
  refunded: "Refunded"
};

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** "in 3 hours" / "starts soon" — the thing a customer actually wants to know. */
function countdown(iso: string): { label: string; urgent: boolean } {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutes <= 0) return { label: "Now showing", urgent: true };
  if (minutes < 60) return { label: `in ${minutes} min`, urgent: minutes <= 45 };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { label: `in ${hours} hour${hours === 1 ? "" : "s"}`, urgent: hours <= 3 };
  const days = Math.round(hours / 24);
  return { label: `in ${days} day${days === 1 ? "" : "s"}`, urgent: false };
}

export default function Account() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("tickets");
  const [bookings, setBookings] = useState<TicketBooking[] | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistResponse>({ ids: [], movies: [] });
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [profile, setProfile] = useState<Profile>({ name: "", mobile: "", paymentPrefs: ["GCash"] });
  const [ticket, setTicket] = useState<TicketBooking | null>(null);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const loadBookings = useCallback(async () => {
    try {
      setBookings(await apiFetch<TicketBooking[]>("/api/account"));
    } catch (err) {
      if (errorMessage(err).toLowerCase().includes("authentication")) {
        router.replace("/signin?next=/account");
        return;
      }
      setError(errorMessage(err, "We couldn't load your tickets."));
      setBookings([]);
    }
  }, [router]);

  useEffect(() => {
    void loadBookings();
    Promise.all([
      apiFetch<WatchlistResponse>("/api/account/watchlist").catch(() => null),
      apiFetch<{ ratings: { bookingId: string; stars: number }[] }>("/api/account/ratings").catch(() => null),
      apiFetch<Profile>("/api/account/profile").catch(() => null)
    ]).then(([watch, ratings, profileData]) => {
      if (watch) setWatchlist(watch);
      if (ratings?.ratings) setMyRatings(Object.fromEntries(ratings.ratings.map(r => [r.bookingId, r.stars])));
      if (profileData) setProfile(profileData);
    });
  }, [loadBookings]);

  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/");
  };

  const toggleWatch = async (movie: WatchlistResponse["movies"][number]) => {
    setError("");
    try {
      const result = await apiPost<{ ids: number[]; action: string }>("/api/account/watchlist", { movieId: movie.id });
      setWatchlist(current => ({
        ids: result.ids,
        movies: result.action === "removed" ? current.movies.filter(item => item.id !== movie.id) : [...current.movies.filter(item => item.id !== movie.id), movie]
      }));
    } catch (err) {
      setError(errorMessage(err, "Could not update your watchlist."));
    }
  };

  const rate = async (bookingId: string, stars: number) => {
    setMyRatings(current => ({ ...current, [bookingId]: stars }));
    try {
      await apiPost("/api/account/ratings", { bookingId, stars });
    } catch (err) {
      setError(errorMessage(err, "Could not save your rating."));
    }
  };

  const cancelBooking = async (booking: TicketBooking) => {
    if (!window.confirm("Cancel this booking? Your seats will be released.")) return;
    setBusyId(booking.id);
    setError("");
    try {
      await apiDelete(`/api/bookings/${booking.id}`, {});
      setMessage("Booking cancelled. Your seats are back on sale.");
      await loadBookings();
      setTicket(null);
    } catch (err) {
      setError(errorMessage(err, "We couldn't cancel that booking."));
    } finally {
      setBusyId("");
    }
  };

  const now = Date.now();
  const upcoming = useMemo(
    () => (bookings ?? [])
      .filter(item => item.showtime && new Date(item.showtime.startTime).getTime() > now)
      .sort((a, b) => new Date(a.showtime!.startTime).getTime() - new Date(b.showtime!.startTime).getTime()),
    [bookings, now]
  );
  const past = useMemo(() => (bookings ?? []).filter(item => !item.showtime || new Date(item.showtime.startTime).getTime() <= now), [bookings, now]);
  const cancelled = useMemo(() => (bookings ?? []).filter(item => ["cancelled", "refunded"].includes(bookingStatus(item))), [bookings]);

  const starRow = (bookingId: string) => (
    <div className="star-row" role="group" aria-label="Rate this movie">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          type="button"
          key={star}
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
          aria-pressed={star <= (myRatings[bookingId] ?? 0)}
          className={star <= (myRatings[bookingId] ?? 0) ? "star on" : "star"}
          onClick={() => rate(bookingId, star)}
        >
          ★
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Head>
        <title>Your account | CinemaBooking</title>
      </Head>
      <SiteHeader />

      <main className="account-page shell">
        <div className="d-flex justify-content-between align-items-center gap-3">
          <div>
            <p className="kicker">YOUR CINEMA</p>
            <h1>Welcome back.</h1>
          </div>
          <button className="button" onClick={signOut}>Sign out</button>
        </div>
        <p className="muted">Your tickets, history, watchlist, and profile — in one place.</p>

        <nav className="dashboard-tabs" aria-label="Account sections">
          {TABS.map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={`dashboard-tab${tab === key ? " active" : ""}`}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        {message && <p className="notice" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}

        {tab === "tickets" && (
          <section className="account-section">
            <div className="section-heading">
              <div>
                <p className="kicker">MY TICKETS</p>
                <h2>Upcoming screenings</h2>
              </div>
            </div>

            {bookings === null ? (
              <div className="ticket-list" aria-busy="true">
                {[0, 1].map(index => <div className="skeleton skeleton-ticket" key={index} />)}
              </div>
            ) : upcoming.length === 0 ? (
              <div className="summary-card empty-state">
                <h2>No upcoming tickets.</h2>
                <p className="muted">Book a film and your ticket will appear here.</p>
                <Link className="button gold-button" href="/">Browse films →</Link>
              </div>
            ) : (
              <div className="ticket-list">
                {upcoming.map(item => {
                  const remaining = item.showtime ? countdown(item.showtime.startTime) : { label: "", urgent: false };
                  const status = bookingStatus(item);
                  return (
                    <article className={`ticket-card${item.checkedInAt ? " checked-in" : ""}`} key={item.id}>
                      {item.showtime?.movie?.posterUrl
                        ? <div className="ticket-poster" style={{ backgroundImage: `url('${item.showtime.movie.posterUrl}')` }} />
                        : <div className="ticket-poster empty" />}
                      <div className="ticket-body">
                        <div className="ticket-meta">
                          <span className={`status-badge ${status === "confirmed" ? "showing" : "soon"}`}>{STATUS_LABEL[status]}</span>
                          {item.checkedInAt
                            ? <span className="muted">Checked in at {timeLabel(item.checkedInAt)}</span>
                            : <span className={`countdown${remaining.urgent ? " urgent" : ""}`}>{remaining.label}</span>}
                          <span className="muted">Receipt #{item.id.slice(0, 8).toUpperCase()}</span>
                        </div>
                        <h3>{item.movieTitle}</h3>
                        <div className="ticket-details">
                          <span><b>Date</b>{item.showtime && dateLabel(item.showtime.startTime)}</span>
                          <span><b>Time</b>{item.showtime && timeLabel(item.showtime.startTime)}</span>
                          <span><b>Hall</b>{item.auditorium}</span>
                          <span><b>Seats</b>{item.seatSnapshot.map(seat => `${seat.row}${seat.number}`).join(", ")}</span>
                          {item.addOns.length > 0 && <span><b>Extras</b>{item.addOns.map(addOn => addOn.name).join(", ")}</span>}
                        </div>
                      </div>
                      <div className="ticket-side">
                        <div className="ticket-total"><span className="muted">Paid</span><strong>{peso(item.totalAmount)}</strong></div>
                        <button className="button gold-button" onClick={() => setTicket(item)}>View ticket</button>
                        {isCancellable(item, 2 * 60 * 60 * 1000) && (
                          <button className="button danger-link" onClick={() => cancelBooking(item)} disabled={busyId === item.id}>
                            {busyId === item.id ? "Cancelling…" : "Cancel"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {cancelled.length > 0 && (
              <details className="cancelled-bookings">
                <summary>{cancelled.length} cancelled booking{cancelled.length === 1 ? "" : "s"}</summary>
                <div className="account-list">
                  {cancelled.map(item => (
                    <div className="account-booking history-item" key={item.id}>
                      <div>
                        <p className="kicker">{STATUS_LABEL[bookingStatus(item)]}</p>
                        <h2>{item.movieTitle}</h2>
                        <p className="muted">{item.auditorium} · {item.seatSnapshot.map(seat => `${seat.row}${seat.number}`).join(", ")}</p>
                      </div>
                      <div className="history-actions"><strong>{peso(item.totalAmount)}</strong></div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}

        {tab === "history" && (
          <section className="account-section">
            <div className="section-heading">
              <div>
                <p className="kicker">BOOKING HISTORY</p>
                <h2>Films you&apos;ve seen</h2>
              </div>
            </div>
            {bookings === null ? (
              <div className="skeleton skeleton-strip" aria-busy="true" />
            ) : past.length === 0 ? (
              <div className="summary-card empty-state">
                <h2>Nothing watched yet.</h2>
                <p className="muted">Your past screenings will show up here.</p>
                <Link className="button gold-button" href="/">Browse films →</Link>
              </div>
            ) : (
              <div className="account-list">
                {past.map(item => (
                  <article className="account-booking history-item" key={item.id}>
                    <div>
                      <p className="kicker">{item.showtime ? new Date(item.showtime.startTime).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "Earlier"}</p>
                      <h2>{item.movieTitle}</h2>
                      <p className="muted">{item.showtime ? `${new Date(item.showtime.startTime).toLocaleDateString()} · ${item.auditorium}` : item.auditorium}</p>
                      <p>Seats: {item.seatSnapshot.map(seat => `${seat.row}${seat.number}`).join(", ")}</p>
                      <div className="rate-line"><span className="muted">Rate this film</span>{starRow(item.id)}</div>
                    </div>
                    <div className="history-actions">
                      <strong>{peso(item.totalAmount)}</strong>
                      {item.showtime?.movie?.id != null && (
                        <Link className="button back-button" href={`/movies/${item.showtime.movie.id}`}>Book again</Link>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "watchlist" && (
          <section className="account-section">
            <div className="section-heading">
              <div>
                <p className="kicker">SAVED WATCHLIST</p>
                <h2>Films you&apos;ve hearted</h2>
              </div>
            </div>
            {!watchlist.movies.length ? (
              <div className="summary-card empty-state">
                <h2>Your watchlist is empty.</h2>
                <p className="muted">Tap the heart on any film poster to save it for later.</p>
                <Link className="button gold-button" href="/movies">Browse films →</Link>
              </div>
            ) : (
              <div className="watch-grid">
                {watchlist.movies.map(movie => {
                  const comingSoon = movie.status === "coming soon";
                  return (
                    <article className="watch-card" key={movie.id}>
                      <div className="watch-poster" style={{ backgroundImage: `url('${movie.posterUrl}')` }}>
                        <button type="button" className="heart-button on" aria-label={`Remove ${movie.title} from watchlist`} onClick={() => toggleWatch(movie)}>♥</button>
                        {comingSoon && movie.releaseDate && (
                          <span className="movie-releases">Releases {new Date(movie.releaseDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                        )}
                      </div>
                      <div className="watch-info">
                        <h3><Link href={`/movies/${movie.id}`}>{movie.title}</Link></h3>
                        {comingSoon ? (
                          <span className="muted">Coming soon</span>
                        ) : (
                          <Link className="button back-button watch-book" href={`/movies/${movie.id}`}>Book now →</Link>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === "profile" && (
          <section className="account-section">
            <div className="section-heading">
              <div>
                <p className="kicker">BASIC PROFILE</p>
                <h2>Your details</h2>
              </div>
            </div>
            <form
              className="profile-form summary-card"
              onSubmit={async event => {
                event.preventDefault();
                setError("");
                try {
                  await apiFetch("/api/account/profile", { method: "PATCH", body: JSON.stringify(profile) });
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2500);
                } catch (err) {
                  setError(errorMessage(err, "We couldn't save your profile."));
                }
              }}
            >
              <label className="field">
                Name
                <input type="text" value={profile.name} onChange={e => setProfile(current => ({ ...current, name: e.target.value }))} placeholder="Your name" />
              </label>
              <label className="field">
                Mobile number
                <input type="tel" value={profile.mobile} onChange={e => setProfile(current => ({ ...current, mobile: e.target.value }))} placeholder="+63 900 000 0000" />
              </label>
              <div className="field">
                <span className="poster-label">Default payment method</span>
                <div className="payment-prefs">
                  {PAYMENT_METHODS.map(method => {
                    const on = profile.paymentPrefs.includes(method);
                    return (
                      <button
                        type="button"
                        key={method}
                        className={`payment-pref${on ? " on" : ""}`}
                        aria-pressed={on}
                        onClick={() => setProfile(current => ({
                          ...current,
                          paymentPrefs: on ? current.paymentPrefs.filter(item => item !== method) : [...current.paymentPrefs, method]
                        }))}
                      >
                        <span aria-hidden="true">{PAYMENT_ICONS[method]}</span>
                        <b>{method}</b>
                        {on && <span className="tick" aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="editor-actions">
                <span className="muted">Your first saved method is preselected at checkout.</span>
                <button className="button gold-button" type="submit">Save profile</button>
              </div>
              {saved && <p className="match ok" role="status">Profile saved.</p>}
            </form>
          </section>
        )}
      </main>

      {ticket && (
        <div className="trailer-scrim" onMouseDown={() => setTicket(null)}>
          <div className="ticket-dialog" role="dialog" aria-modal="true" aria-label={`E-ticket for ${ticket.movieTitle}`} onMouseDown={event => event.stopPropagation()}>
            <button type="button" className="trailer-close ticket-close" aria-label="Close ticket" onClick={() => setTicket(null)}>✕</button>
            <p className="kicker">E-TICKET · {STATUS_LABEL[bookingStatus(ticket)].toUpperCase()}</p>
            <h3>{ticket.movieTitle}</h3>
            <div className="ticket-dialog-body">
              <div className="ticket-qr-wrap">
                <QrTicket value={ticket.ticketCode} size={200} label={`Scannable ticket code ${ticket.ticketCode}`} />
                <code className="ticket-code">{ticket.ticketCode}</code>
              </div>
              <div className="ticket-dialog-details">
                <span><b>Date</b>{ticket.showtime ? dateLabel(ticket.showtime.startTime) : "—"}</span>
                <span><b>Time</b>{ticket.showtime ? timeLabel(ticket.showtime.startTime) : "—"}</span>
                <span><b>Hall</b>{ticket.auditorium}</span>
                <span><b>Seats</b>{ticket.seatSnapshot.map(seat => `${seat.row}${seat.number}`).join(", ")}</span>
                <span><b>Receipt</b>#{ticket.id.slice(0, 8).toUpperCase()}</span>
                <span><b>Total</b>{peso(ticket.totalAmount)}</span>
              </div>
            </div>
            <div className="ticket-dialog-actions">
              <a className="button gold-button" href={`/api/bookings/${ticket.id}?format=ics`} download={`cinema-${ticket.id.slice(0, 8)}.ics`}>
                Add to calendar
              </a>
              <button className="button" onClick={() => window.print()}>Print</button>
            </div>
            <p className="muted ticket-note">Show this code at the entrance. Please arrive 15 minutes early.</p>
          </div>
        </div>
      )}

      <SiteFooter />
    </>
  );
}