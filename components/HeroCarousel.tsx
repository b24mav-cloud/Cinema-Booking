import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { Movie } from "../lib/types";

type Slide = { id: number; title: string; posterUrl: string; genre: string; cast: string; description: string; isComingSoon: boolean; releaseDate: string | null };

type Drag = { startX: number; lastX: number; lastT: number; moved: boolean; vx: number };

export function HeroCarousel() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [active, setActive] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [reduced, setReduced] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const didDrag = useRef(false);
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
      .then((movies: Movie[]) => {
        if (cancelled) return;
        const showing = movies.filter(movie => movie.status !== "archived" && movie.status !== "coming soon");
        const coming = movies.filter(movie => movie.status === "coming soon");
        setSlides([...showing, ...coming]
          .filter(movie => movie.posterUrl)
          .map(movie => ({
            id: movie.id,
            title: movie.title,
            posterUrl: movie.posterUrl,
            genre: movie.genre ?? movie.tags?.[0] ?? "",
            cast: movie.cast ?? "",
            description: movie.description ?? movie.synopsis ?? "",
            isComingSoon: movie.status === "coming soon",
            releaseDate: movie.releaseDate ?? null
          })));
        setActive(0);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const unit = () => {
    const slide = trackRef.current?.querySelector<HTMLElement>(".coverflow-slide");
    return (slide?.offsetWidth ?? 230) + 18;
  };

  useEffect(() => {
    if (slides.length < 2 || reduced) return;
    const ticker = window.setInterval(() => {
      if (!hold.current) setActive(current => (current + 1) % slides.length);
    }, 3750);
    return () => window.clearInterval(ticker);
  }, [slides.length, reduced]);

  const go = (target: number) => {
    if (!slides.length) return;
    setActive(((target % slides.length) + slides.length) % slides.length);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reduced || !slides.length) return;
    hold.current = true;
    didDrag.current = false;
    const time = performance.now();
    drag.current = { startX: event.clientX, lastX: event.clientX, lastT: time, moved: false, vx: 0 };
    setDragging(true);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer capture is optional */ }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    setDragX(event.clientX - current.startX);
    const time = performance.now();
    const delta = Math.max(1, time - current.lastT);
    current.vx = 0.7 * ((event.clientX - current.lastX) / delta) + 0.3 * current.vx;
    current.lastX = event.clientX;
    current.lastT = time;
    if (Math.abs(event.clientX - current.startX) > 5) current.moved = true;
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    drag.current = null;
    setDragging(false);
    hold.current = false;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer capture is optional */ }
    if (!current) return;
    const dx = event.clientX - current.startX;
    const snapped = Math.round(-dx / unit());
    if (snapped !== 0) {
      go(active + snapped);
      didDrag.current = true;
    } else if (Math.abs(current.vx) > 0.35) {
      go(active + (current.vx < 0 ? 1 : -1));
      didDrag.current = true;
    } else {
      didDrag.current = current.moved;
    }
    setDragX(0);
  };

  const onSlideClick = (index: number) => {
    if (didDrag.current) { didDrag.current = false; return; }
    if (index !== active) go(index);
  };

  const distance = (index: number) => {
    let delta = index - active;
    if (delta > slides.length / 2) delta -= slides.length;
    if (delta < -slides.length / 2) delta += slides.length;
    return delta;
  };

  const scaleOf = (delta: number) => (delta === 0 ? 1 : Math.abs(delta) === 1 ? 0.86 : 0.74);
  const opacityOf = (delta: number) => (delta === 0 ? 1 : Math.abs(delta) === 1 ? 0.45 : 0.15);

  return <section className="hero-carousel" aria-label="Featured films" aria-roledescription="carousel">
    <div className={`coverflow-viewport${dragging ? " is-dragging" : ""}`}>
      <div
        ref={trackRef}
        className="coverflow-track"
        role="group"
        tabIndex={0}
        aria-label="Browse featured films"
        onKeyDown={event => {
          if (event.key === "ArrowRight") { event.preventDefault(); go(active + 1); }
          if (event.key === "ArrowLeft") { event.preventDefault(); go(active - 1); }
          if (event.key === "Home") { event.preventDefault(); go(0); }
          if (event.key === "End") { event.preventDefault(); go(slides.length - 1); }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={() => { drag.current = null; setDragging(false); setDragX(0); hold.current = false; }}
        onFocus={() => { hold.current = true; }}
        onBlur={() => { hold.current = false; }}
      >
        {slides.map((slide, index) => {
          const delta = distance(index);
          if (Math.abs(delta) > 2) return null;
          return <article
            key={slide.id}
            role="group"
            aria-roledescription="slide"
            className="coverflow-slide"
            style={{
              transform: `translateX(calc(-50% + ${delta * unit() + dragX}px)) scale(${scaleOf(delta)})`,
              opacity: opacityOf(delta),
              zIndex: 5 - Math.abs(delta)
            }}
            onClick={() => onSlideClick(index)}
          >
            <img src={slide.posterUrl} alt={`${slide.title} poster`} draggable={false} />
            <span className={`hero-status${slide.isComingSoon ? " is-coming" : ""}`}>{slide.isComingSoon ? "Coming soon" : "Now showing"}</span>
            {delta === 0 && <div className="slide-caption">
              <strong>{slide.title}</strong>
              <span>{slide.genre}{slide.cast ? ` · ${slide.cast}` : ""}</span>
              {!slide.isComingSoon && <p>{slide.description}</p>}
              {slide.isComingSoon && slide.releaseDate && <p>Releases {new Date(slide.releaseDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>}
            </div>}
          </article>;
        })}
      </div>
    </div>
    <div className="carousel-controls">
      <button type="button" className="carousel-arrow" onClick={() => go(active - 1)} aria-label="Previous films">←</button>
      <div className="carousel-dots">{slides.map((slide, index) => <button key={slide.id} type="button" className={`carousel-dot${index === active ? " active" : ""}`} onClick={() => go(index)} aria-label={`Go to ${slide.title}`} />)}</div>
      <button type="button" className="carousel-arrow" onClick={() => go(active + 1)} aria-label="Next films">→</button>
    </div>
  </section>;
}
