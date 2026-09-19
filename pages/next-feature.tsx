import Head from "next/head";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";

export default function NextFeature() {
  return <><Head><title>Next feature | CinemaBooking</title></Head><SiteHeader /><main className="how shell"><p className="kicker">CINEMABOOKING</p><h1>Next feature</h1><p className="section-intro">Details for our next feature will appear here.</p></main><SiteFooter /></>;
}