import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";
import { HeroBanner, BannerTab } from "../components/HeroBanner";
import { BookingWizard } from "../components/booking/BookingWizard";
import { useBookingFlow } from "../lib/useBookingFlow";

const STEPS = [
  ["01", "Pick a film", "Browse stories curated for the big screen."],
  ["02", "Make it yours", "Choose your seats and favourite treats."],
  ["03", "Walk in ready", "Your booking waits when the lights go down."]
] as const;

export default function Home() {
  const router = useRouter();
  const [browseTab, setBrowseTab] = useState<BannerTab>("showing");
  const [deepLink, setDeepLink] = useState<number | undefined>();

  // `?movie=<id>` is kept working so existing links and bookmarks still land on
  // the right film, but real pages now live at /movies/<id>. `?showtime=<id>`
  // jumps straight to seat selection.
  useEffect(() => {
    const showtimeId = Number(router.query.showtime);
    if (Number.isFinite(showtimeId) && showtimeId) {
      flow.jumpToShowtime(showtimeId);
      document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const requested = Number(router.query.movie);
    if (!Number.isFinite(requested) || !requested) return;
    setDeepLink(requested);
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [router.query.movie, router.query.showtime]);

  const flow = useBookingFlow(deepLink);

  const bannerCta = (tab: BannerTab) => {
    setBrowseTab(tab);
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <Head>
        <title>CinemaBooking — Your night, your way</title>
        <meta name="description" content="Book cinema tickets at CinemaBooking. Seven auditoriums, reserved seating, and movie-night concessions ready when you are." />
      </Head>
      <SiteHeader />

      <main>
        <HeroBanner onCta={bannerCta} />

        <section className="booking shell" id="booking">
          <div className="section-heading">
            <div>
              <p className="kicker">THE LINEUP</p>
              <h2>What will you watch?</h2>
              <p className="section-intro">One cinema, seven auditoriums, and a seat waiting for you.</p>
            </div>
          </div>

          <BookingWizard flow={flow} browseTab={browseTab} onTabChange={setBrowseTab} />
        </section>

        <section className="how shell" id="how">
          <p className="kicker">SIMPLE BY DESIGN</p>
          <h2>Your seat is three steps away.</h2>
          <div className="how-grid">
            {STEPS.map(([number, heading, copy]) => (
              <article key={number}>
                <b>{number}</b>
                <h3>{heading}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}