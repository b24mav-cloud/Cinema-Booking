import Head from "next/head";
import Link from "next/link";
import { SiteHeader } from "../components/SiteHeader";

export default function NowShowing() {
  return <><Head><title>Now showing | CinemaBooking</title></Head><SiteHeader /><main className="how shell"><p className="kicker">CINEMABOOKING</p><h1>Now showing</h1><p className="section-intro">Browse the full schedule in the booking flow.</p><Link className="button gold-button" href="/#booking">Browse films →</Link></main><footer className="footer shell"><strong>CB CinemaBooking</strong><span>Good films. Great company. © 2026</span></footer></>;
}