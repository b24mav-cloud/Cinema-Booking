import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { MovieWithShowtimes } from "../lib/types";
import { MzaCarousel } from "../lib/MzaCarousel";

type Slide = {
  id: string;
  kind: "promo" | "movie";
  kicker: string;
  title: string;
  tagline: string;
  image?: string;
  status?: "showing" | "soon";
  releaseDate?: string | null;
};

export type BannerTab = "showing" | "soon";

const promoSlide = (): Slide => ({
  id: "promo",
  kind: "promo",
  kicker: "THE CINEMA, REIMAGINED",
  title: "Your night.\nYour way.",
  tagline:
    "Premium screens, plush seats, and stories worth staying up for. Make your next movie night memorable.",
  image: undefined
});

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

export function HeroBanner({ onCta }: { onCta?: (tab: BannerTab) => void }) {
  const [slides, setSlides] = useState<Slide[]>([promoSlide()]);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/movies")
      .then(response => response.json())
      .then((movies: MovieWithShowtimes[]) => {
        if (cancelled) return;
        const showing = movies.filter(movie => movie.status === "now showing" && movie.posterUrl);
        const coming = movies.filter(movie => movie.status === "coming soon" && movie.posterUrl);
        const next: Slide[] = [promoSlide()];
        showing.slice(0, 3).forEach(movie => next.push({
          id: `show-${movie.id}`,
          kind: "movie",
          kicker: "NOW SHOWING",
          title: movie.title,
          tagline: movie.description ?? movie.synopsis ?? movie.genre ?? "",
          image: movie.posterUrl,
          status: "showing",
          releaseDate: null
        }));
        coming.slice(0, 2).forEach(movie => next.push({
          id: `soon-${movie.id}`,
          kind: "movie",
          kicker: "COMING SOON",
          title: movie.title,
          tagline: movie.genre ?? "",
          image: movie.posterUrl,
          status: "soon",
          releaseDate: movie.releaseDate ?? null
        }));
        setSlides(next);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !slides.length) return;
    const carousel = new MzaCarousel(root, { transitionMs: 900, interval: 3000 });
    return () => carousel.destroy();
  }, [slides]);

  return (
    <section ref={rootRef} id="mzaCarousel" className="mzaCarousel" aria-label="Featured films and promotions" aria-roledescription="carousel" tabIndex={0}>
      <div className="mzaCarousel-ambient" aria-hidden="true" />
      <div className="mzaCarousel-viewport">
        <div className="mzaCarousel-track">
          {slides.map((slide, index) => {
            const background = slide.image ?? "/popup-cinema-bg.avif";
            return (
              <div className="mzaCarousel-slide" key={slide.id} data-state={index === 0 ? "active" : "rest"} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${slides.length}`}>
                <article className="mzaCard" style={{ "--mzaCard-bg": `url("${background}")` } as CSSProperties}>
                  <div className="mzaCard-media" aria-hidden="true" />
                  <div className="mzaCard-scrim" aria-hidden="true" />
                  <div className="mzaCard-body">
                    <p className="kicker">{slide.kicker}</p>
                    <h2 className="mzaCard-title">
                      {slide.title.split("\n").map((line, i, lines) => <span key={i}>{line}{i < lines.length - 1 && <br />}</span>)}
                    </h2>
                    {slide.kind === "movie" && slide.releaseDate
                      ? <p className="mzaCard-release">Releases {new Date(slide.releaseDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
                      : slide.tagline ? <p className="mzaCard-tagline">{slide.tagline}</p> : null}
                    <button type="button" className="button gold-button mzaCard-cta" onClick={() => onCta?.(slide.status === "soon" ? "soon" : "showing")}>
                      {slide.kind === "promo" ? "Book your experience →" : slide.status === "soon" ? "View coming soon" : "Book now →"}
                    </button>
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      </div>
      <button type="button" className="mzaCarousel-prev" aria-label="Previous slide"><Chevron direction="left" /></button>
      <button type="button" className="mzaCarousel-next" aria-label="Next slide"><Chevron direction="right" /></button>
      <div className="mzaCarousel-pagination" role="tablist" aria-label="Choose a slide" />
      <div className="mzaCarousel-progress" aria-hidden="true"><span className="mzaCarousel-progressBar" /></div>
    </section>
  );
}
