import Head from "next/head";
import Link from "next/link";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";

export default function NowShowing() {
  return <><Head><title>Now showing | CinemaBooking</title></Head><SiteHeader /><main className="how shell"><p className="kicker">CINEMABOOKING</p><h1>Now showing</h1><p className="section-intro">Browse the full schedule in the booking flow.</p><Link className="button gold-button" href="/#booking">Browse films →</Link></main><SiteFooter /></>;
}