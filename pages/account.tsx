import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { SiteHeader } from "../components/SiteHeader";
import { peso } from "../lib/types";
type Booking = { id: string; movieTitle: string; auditorium: string; totalAmount: number; isConfirmed: boolean; seatSnapshot: { row: string; number: number }[]; showtime: { startTime: string } };
export default function Account() {
  const router = useRouter(); const [bookings, setBookings] = useState<Booking[] | null>(null);
  useEffect(() => { fetch("/api/account").then(async r => { if (!r.ok) return router.replace("/signin?next=/account"); setBookings(await r.json()); }); }, [router]);
  const signOut = async () => { await fetch("/api/auth/signout", { method: "POST" }); router.push("/"); };
  return <><Head><title>Your account | CinemaBooking</title></Head><SiteHeader /><main className="account-page shell"><div className="d-flex justify-content-between align-items-center gap-3"><div><p className="kicker">YOUR ACCOUNT</p><h1>Your bookings.</h1></div><button className="button" onClick={signOut}>Sign out</button></div><p className="muted">Your most recent reservations appear first.</p><section className="account-list">{bookings?.length ? bookings.map(item => <article className="account-booking" key={item.id}><div><p className="kicker">{item.isConfirmed ? "CONFIRMED" : "PENDING"}</p><h2>{item.movieTitle}</h2><p className="muted">{new Date(item.showtime.startTime).toLocaleString()} · {item.auditorium}</p><p>Seats: {item.seatSnapshot.map(seat => seat.row + seat.number).join(", ")}</p></div><div><strong>{peso(item.totalAmount)}</strong><br /><span className="muted">Receipt #{item.id.slice(0, 8).toUpperCase()}</span></div></article>) : bookings && <div className="summary-card"><h2>No bookings yet.</h2><p className="muted">Choose a film and your next receipt will appear here.</p><Link className="button gold-button" href="/">Browse films →</Link></div>}</section></main></>;
}
