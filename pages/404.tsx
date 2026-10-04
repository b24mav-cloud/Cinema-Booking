import Head from "next/head";
import Link from "next/link";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Page not found | CinemaBooking</title>
        <meta name="robots" content="noindex" />
      </Head>
      <SiteHeader />
      <main className="shell not-found">
        <p className="kicker">404</p>
        <h1>This one's not showing.</h1>
        <p className="muted">The page you were looking for has either moved or never existed.</p>
        <div className="confirmation-actions">
          <Link className="button gold-button" href="/">Browse films</Link>
          <Link className="button" href="/movies">All films</Link>
          <Link className="button" href="/account">My tickets</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}