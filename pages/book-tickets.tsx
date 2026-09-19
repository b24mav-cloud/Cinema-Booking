import Head from "next/head";
import Link from "next/link";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";

export default function BookTickets() {
  return <><Head><title>Book tickets | CinemaBooking</title></Head><SiteHeader /><main className="how shell"><p className="kicker">CINEMABOOKING</p><h1>Book tickets</h1><p className="section-intro">Pick a film, choose your seats, and confirm in five easy steps.</p><Link className="button gold-button" href="/#booking">Start booking →</Link></main><SiteFooter /></>;
}