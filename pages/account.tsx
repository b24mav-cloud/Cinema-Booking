import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { SiteHeader } from "../components/SiteHeader";
import { peso } from "../lib/types";
import { qrPlaceholderSvg } from "../lib/qrPlaceholder";

type BookingRecord = {
  id: string;
  movieTitle: string;
  auditorium: string;
  totalAmount: number;
  isConfirmed: boolean;
  seatSnapshot: { row: string; number: number; price: number }[];
  paymentMethod: string;
  createdAt: string;
  showtime: {
    startTime: string;
    endTime?: string;
    experience?: string;
    price?: number;
    movie?: { id: number; title: string; posterUrl?: string; durationMinutes?: number } | null;
  } | null;
};
type WatchlistResponse = { ids: number[]; movies: { id: number; title: string; posterUrl: string; status?: string; releaseDate?: string | null }[] };
type Profile = { name: string; mobile: string; paymentPrefs: string[] };

const PAYMENT_METHODS = ["GCash", "Maya", "Card"];
const PAYMENT_ICONS: Record<string, string> = { GCash: "🇵🇭", Maya: "💳", Card: "💳" };

const tabs = [
  ["tickets", "My Tickets"],
  ["history", "Booking History"],
  ["watchlist", "Saved Watchlist"],
  ["profile", "Profile"]
] as const;

export default function Account() {
  const router = useRouter();
  const [tab, setTab] = useState<"tickets" | "history" | "watchlist" | "profile">("tickets");
  const [bookings, setBookings] = useState<BookingRecord[] | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistResponse>({ ids: [], movies: [] });
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [profile, setProfile] = useState<Profile>({ name: "", mobile: "", paymentPrefs: ["GCash"] });
  const [ticket, setTicket] = useState<BookingRecord | null>(null);
  const [saved, setSaved] = useState(false);
  const [watchError, setWatchError] = useState("");

  const loadBookings = async () => {
    const response = await fetch("/api/account");
    if (!response.ok) return router.replace("/signin?next=/account");
    setBookings(await response.json());
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/account/watchlist").then(r => r.ok ? r.json() : null),
      fetch("/api/account/ratings").then(r => r.ok ? r.json() : null),
      fetch("/api/account/profile").then(r => r.ok ? r.json() : null)
    ]).then(([watch, ratings, profileData]) => {
      if (watch) setWatchlist(watch);
      if (ratings?.ratings) setMyRatings(Object.fromEntries(ratings.ratings.map((r: { bookingId: string; stars: number }) => [r.bookingId, r.stars])));
      if (profileData) setProfile(profileData);
    });
    loadBookings();
  }, []);

  const signOut = async () => { await fetch("/api/auth/signout", { method: "POST" }); router.push("/"); };

  const toggleWatch = async (movie: WatchlistResponse["movies"][number]) => {
    setWatchError("");
    const response = await fetch("/api/account/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ movieId: movie.id }) });
    if (!response.ok) { setWatchError("Could not update your watchlist."); return; }
    const result = await response.json();
    setWatchlist(current => ({
      ids: result.ids,
      movies: result.action === "removed" ? current.movies.filter(item => item.id !== movie.id) : [...current.movies.filter(item => item.id !== movie.id), movie]
    }));
  };

  const rate = async (bookingId: string, stars: number) => {
    setMyRatings(current => ({ ...current, [bookingId]: stars }));
    await fetch("/api/account/ratings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, stars }) });
  };

  const currentTime = Date.now();
  const upcoming = bookings ? bookings.filter(item => item.showtime && new Date(item.showtime.startTime).getTime() > currentTime) : [];
  const history = bookings ? bookings.filter(item => !item.showtime || new Date(item.showtime.startTime).getTime() <= currentTime) : [];

  const starRow = (bookingId: string, size = "star-row") => (
    <div className={size} aria-label="Rate this movie">
      {[1, 2, 3, 4, 5].map(star => (
        <button type="button" key={star} aria-label={`${star} star${star !== 1 ? "s" : ""}`} className={star <= (myRatings[bookingId] ?? 0) ? "star on" : "star"} onClick={() => rate(bookingId, star)}>★</button>
      ))}
    </div>
  );

  const watchMovies = watchlist.movies.length ? watchlist.movies : null;

  return <><Head><title>Your account | CinemaBooking</title></Head><SiteHeader /><main className="account-page shell">
    <div className="d-flex justify-content-between align-items-center gap-3"><div><p className="kicker">YOUR CINEMA</p><h1>Welcome back.</h1></div><button className="button" onClick={signOut}>Sign out</button></div>
    <p className="muted">Your tickets, history, watchlist, and profile — in one place.</p>

    <nav className="dashboard-tabs" aria-label="Account sections">
      {tabs.map(([key, label]) => <button type="button" key={key} className={`dashboard-tab${tab === key ? " active" : ""}`} onClick={() => setTab(key)}>{label}</button>)}
    </nav>

    {tab === "tickets" && <section className="account-section">
      <div className="section-heading"><div><p className="kicker">MY TICKETS</p><h2>Upcoming screenings</h2></div></div>
      {bookings === null ? <p className="muted">Loading…</p> : upcoming.length === 0
        ? <div className="summary-card empty-state"><h2>No upcoming tickets.</h2><p className="muted">Book a film and your ticket will appear here.</p><Link className="button gold-button" href="/">Browse films →</Link></div>
        : <div className="ticket-list">{upcoming.sort((a, b) => new Date(a.showtime!.startTime).getTime() - new Date(b.showtime!.startTime).getTime()).map(item => (
          <article className="ticket-card" key={item.id}>
            {item.showtime?.movie?.posterUrl
              ? <div className="ticket-poster" style={{ backgroundImage: `url('${item.showtime.movie.posterUrl}')` }} />
              : <div className="ticket-poster empty" />}
            <div className="ticket-body">
              <div className="ticket-meta"><span className={`status-badge ${item.isConfirmed ? "showing" : "soon"}`}>{item.isConfirmed ? "Confirmed" : "Pending"}</span><span className="muted">Receipt #{item.id.slice(0, 8).toUpperCase()}</span></div>
              <h3>{item.movieTitle}</h3>
              <div className="ticket-details">
                <span><b>Date</b>{new Date(item.showtime!.startTime).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>
                <span><b>Time</b>{new Date(item.showtime!.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                <span><b>Hall</b>{item.auditorium}</span>
                <span><b>Seats</b>{item.seatSnapshot.map(seat => seat.row + seat.number).join(", ")}</span>
              </div>
            </div>
            <div className="ticket-side">
              <div className="ticket-total"><span className="muted">Paid</span><strong>{peso(item.totalAmount)}</strong></div>
              <button className="button gold-button" onClick={() => setTicket(item)}>View Ticket / QR Code</button>
            </div>
          </article>
        ))}</div>}
    </section>}

    {tab === "history" && <section className="account-section">
      <div className="section-heading"><div><p className="kicker">BOOKING HISTORY</p><h2>Films you've seen</h2></div></div>
      {bookings === null ? <p className="muted">Loading…</p> : history.length === 0
        ? <div className="summary-card empty-state"><h2>Nothing watched yet.</h2><p className="muted">Your past screenings will show up here.</p></div>
        : <div className="account-list history-list">{history.map(item => (
          <article className="account-booking history-item" key={item.id}>
            <div>
              <p className="kicker">{item.showtime ? new Date(item.showtime.startTime).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }) : "Earlier"}</p>
              <h2>{item.movieTitle}</h2>
              <p className="muted">{item.showtime ? `${new Date(item.showtime.startTime).toLocaleDateString()} · ${item.auditorium}` : item.auditorium}</p>
              <p>Seats: {item.seatSnapshot.map(seat => seat.row + seat.number).join(", ")}</p>
              <div className="rate-line"><span className="muted">Rate this film</span>{starRow(item.id)}</div>
            </div>
            <div className="history-actions">
              <strong>{peso(item.totalAmount)}</strong>
              {item.showtime?.movie?.id != null && <Link className="button back-button" href={`/?movie=${item.showtime.movie.id}`}>Book Again</Link>}
            </div>
          </article>
        ))}</div>}
    </section>}

    {tab === "watchlist" && <section className="account-section">
      <div className="section-heading"><div><p className="kicker">SAVED WATCHLIST</p><h2>Films you've hearted</h2></div></div>
      {watchError && <p className="error">{watchError}</p>}
      {!watchMovies
        ? <div className="summary-card empty-state"><h2>Your watchlist is empty.</h2><p className="muted">Tap the heart on any film poster to save it for later.</p><Link className="button gold-button" href="/">Browse films →</Link></div>
        : <div className="watch-grid">{watchMovies.map(movie => {
          const comingSoon = movie.status === "coming soon";
          return <article className="watch-card" key={movie.id}>
            <div className="watch-poster" style={{ backgroundImage: `url('${movie.posterUrl}')` }}>
              <button type="button" className="heart-button on" aria-label={`Remove ${movie.title} from watchlist`} onClick={() => toggleWatch(movie)}>♥</button>
              {comingSoon && movie.releaseDate && <span className="movie-releases">Releases {new Date(movie.releaseDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
            </div>
            <div className="watch-info">
              <h3>{movie.title}</h3>
              {comingSoon
                ? <span className="muted">Coming soon</span>
                : <Link className="button back-button watch-book" href="/">Book now →</Link>}
            </div>
          </article>;
        })}</div>}
    </section>}

    {tab === "profile" && <section className="account-section">
      <div className="section-heading"><div><p className="kicker">BASIC PROFILE</p><h2>Your details</h2></div></div>
      <form className="profile-form summary-card" onSubmit={async event => {
        event.preventDefault();
        const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
        if (response.ok) {
          setSaved(true);
          window.setTimeout(() => setSaved(false), 2500);
        }
      }}>
        <label className="field">Name<input type="text" value={profile.name} onChange={e => setProfile(current => ({ ...current, name: e.target.value }))} placeholder="Your name" /></label>
        <label className="field">Mobile number<span className="field-hint">used for SMS ticket alerts</span><input type="tel" value={profile.mobile} onChange={e => setProfile(current => ({ ...current, mobile: e.target.value }))} placeholder="+63 900 000 0000" /></label>
        <div className="field"><span className="poster-label">Saved payment preferences</span>
          <div className="payment-prefs">{PAYMENT_METHODS.map(method => {
            const on = profile.paymentPrefs.includes(method);
            return <button type="button" key={method} className={`payment-pref${on ? " on" : ""}`} onClick={() => setProfile(current => ({ ...current, paymentPrefs: on ? current.paymentPrefs.filter(item => item !== method) : [...current.paymentPrefs, method] }))}><span>{PAYMENT_ICONS[method]}</span><b>{method}</b>{on ? " ✓" : ""}</button>;
          })}</div>
        </div>
        <div className="editor-actions">
          <span className="muted">Mobile &amp; saved payment details are used to speed up your next booking.</span>
          <button className="button gold-button" type="submit">Save profile</button>
        </div>
        {saved && <p className="match ok">Profile saved.</p>}
      </form>
    </section>}

    {ticket && <div className="trailer-scrim" onClick={() => setTicket(null)}>
      <div className="ticket-dialog" onClick={event => event.stopPropagation()}>
        <button type="button" className="trailer-close ticket-close" aria-label="Close ticket" onClick={() => setTicket(null)}>✕</button>
        <p className="kicker">E-TICKET · {ticket.isConfirmed ? "CONFIRMED" : "PENDING"}</p>
        <h3>{ticket.movieTitle}</h3>
        <div className="ticket-dialog-body">
          <img className="ticket-qr" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrPlaceholderSvg(ticket.id))}`} alt="QR code for this ticket" />
          <div className="ticket-dialog-details">
            <span><b>Date</b>{ticket.showtime ? new Date(ticket.showtime.startTime).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) : "—"}</span>
            <span><b>Time</b>{ticket.showtime ? new Date(ticket.showtime.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}</span>
            <span><b>Hall</b>{ticket.auditorium}</span>
            <span><b>Seats</b>{ticket.seatSnapshot.map(seat => seat.row + seat.number).join(", ")}</span>
            <span><b>Receipt</b>#{ticket.id.slice(0, 8).toUpperCase()}</span>
            <span><b>Total</b>{peso(ticket.totalAmount)}</span>
          </div>
        </div>
        <p className="muted ticket-note">Show this code at the entrance for scanning. Please arrive 15 minutes early.</p>
      </div>
    </div>}
  </main></>;
}