import Head from "next/head";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";

export default function About() {
  return <><Head><title>About us | CinemaBooking</title></Head><SiteHeader /><main className="how shell"><p className="kicker">CINEMABOOKING</p><h1>About us</h1><p className="section-intro">This page is ready for our cinema story and team information.</p></main><SiteFooter /></>;
}