import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { MovieWithShowtimes } from "../lib/types";

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
  tagline: "Premium screens, plush seats, and stories worth staying up for. Make your next movie night memorable.",
  image: undefined
});

export function HeroBanner({ onCta }: { onCta?: (tab: BannerTab) => void }) {
  const [slides, setSlides] = useState<Slide[]>([promoSlide()]);
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(false);
  const hold = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/movies")
      .then(async response => response.json())
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
        setActive(0);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (slides.length < 2 || reduced) return;
    const ticker = window.setInterval(() => {
      if (!hold.current) setActive(current => (current + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(ticker);
  }, [slides.length, reduced]);

  const go = (target: number) => {
    if (!slides.length) return;
    setActive(((target % slides.length) + slides.length) % slides.length);
  };

  const pause = () => { hold.current = true; };
  const resume = () => { hold.current = false; };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowRight") { event.preventDefault(); go(active + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(active - 1); }
    if (event.key === "Home") { event.preventDefault(); go(0); }
    if (event.key === "End") { event.preventDefault(); go(slides.length - 1); }
  };

  return <section className="hero-banner" aria-label="Featured films and promotions" aria-roledescription="carousel" tabIndex={0}
    onKeyDown={onKeyDown}
    onMouseEnter={pause} onMouseLeave={resume}
    onFocus={pause} onBlur={resume}
    onPointerDown={pause} onPointerUp={resume} onPointerCancel={resume}
  >
    <div className="hero-banner-ambient" aria-hidden />
    {slides.map((slide, index) => <div className={`hero-banner-slide${index === active ? " is-active" : ""}`} key={slide.id} aria-hidden={index !== active} aria-roledescription="slide">
      {slide.image && <img className="hero-banner-bg" src={slide.image} alt="" draggable={false} loading={index > 0 ? "lazy" : undefined} />}
      <div className="hero-banner-scrim" />
      <div className="hero-banner-copy shell">
        <p className="kicker">{slide.kicker}</p>
        <h1>{slide.title.split("\n").map((line, i, lines) => <span key={i}>{line}{i < lines.length - 1 && <br />}</span>)}</h1>
        {slide.kind === "movie" && slide.releaseDate
          ? <p className="hero-banner-release">Releases {new Date(slide.releaseDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
          : slide.tagline ? <p>{slide.tagline}</p> : null}
        <button className="button gold-button hero-banner-cta" onClick={() => onCta?.(slide.status === "soon" ? "soon" : "showing")}>
          {slide.kind === "promo" ? "Book your experience →" : slide.status === "soon" ? "View coming soon" : "Book now →"}
        </button>
      </div>
    </div>)}
    <button type="button" className="hero-banner-arrow prev" onClick={() => go(active - 1)} aria-label="Previous slide">←</button>
    <button type="button" className="hero-banner-arrow next" onClick={() => go(active + 1)} aria-label="Next slide">→</button>
    <div className="hero-banner-dots">{slides.map((slide, index) => <button key={slide.id} type="button" className={`hero-banner-dot${index === active ? " active" : ""}`} onClick={() => go(index)} aria-label={`Go to slide ${index + 1}`} aria-pressed={index === active} />)}</div>
  </section>;
}