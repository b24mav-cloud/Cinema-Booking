import type { AppProps } from "next/app";
import "bootstrap/dist/css/bootstrap.min.css";
import "../public/styles.css";
import { inter, interTight, plexMono } from "../lib/fonts";

// next/font is not supported in _document, so the loader variables are attached to
// this wrapper. The type stack therefore lives on `.app-root` rather than on
// `body`: a custom property set on a child element is invisible to an ancestor,
// so a `body { font: ... var(--font-sans) }` rule could never resolve and the
// whole shorthand was dropped, leaving the browser default serif.
export default function CinemaBookingApp({ Component, pageProps }: AppProps) {
  return (
    <div className={`app-root ${inter.variable} ${interTight.variable} ${plexMono.variable}`}>
      <Component {...pageProps} />
    </div>
  );
}
