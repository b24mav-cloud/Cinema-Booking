import type { AppProps } from "next/app";
import "bootstrap/dist/css/bootstrap.min.css";
import "../public/styles.css";
import { inter, interTight, plexMono } from "../lib/fonts";

export default function CinemaBookingApp({ Component, pageProps }: AppProps) {
  return (
    <div className={`${inter.variable} ${interTight.variable} ${plexMono.variable}`}>
      <Component {...pageProps} />
    </div>
  );
}
