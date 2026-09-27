import type { AppProps } from "next/app";
import "bootstrap/dist/css/bootstrap.min.css";
import "../public/styles.css";
import { inter, sourceSerif } from "../lib/fonts";

export default function CinemaBookingApp({ Component, pageProps }: AppProps) {
  return (
    <div className={`${inter.variable} ${sourceSerif.variable}`}>
      <Component {...pageProps} />
    </div>
  );
}
