import Head from "next/head";
import { SiteHeader } from "../components/SiteHeader";

export default function About() {
  return <><Head><title>About us | CinemaBooking</title></Head><SiteHeader /><main className="how shell"><p className="kicker">CINEMABOOKING</p><h1>About us</h1><p className="section-intro">This page is ready for our cinema story and team information.</p></main><footer className="footer shell"><strong>CB CinemaBooking</strong><span>Good films. Great company. © 2026</span></footer></>;
}