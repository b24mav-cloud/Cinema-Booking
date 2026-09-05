import type { AppProps } from "next/app";
import "bootstrap/dist/css/bootstrap.min.css";
import "../public/styles.css";

export default function CinemaBookingApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
