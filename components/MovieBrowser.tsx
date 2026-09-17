import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { TrailerModal } from "./TrailerModal";
import type { BannerTab } from "./HeroBanner";
import type { MovieWithShowtimes } from "../lib/types";
import { peso } from "../lib/types";

type Props = {
  movies: MovieWithShowtimes[];
  activeTab: BannerTab;
  onTabChange: (tab: BannerTab) => void;
  selectedId?: number;
  onSelect: (movie: MovieWithShowtimes) => void;
};

const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function MovieBrowser({ movies, activeTab, onTabChange, selectedId, onSelect }: Props) {
  const router = useRouter();
  const [trailer, setTrailer] = useState<{ movie: MovieWithShowtimes; trigger: HTMLButtonElement | null } | null>(null);
  const [reachedEnds, setReachedEnds] = useState({ start: true, end: false });
  const [watchlist, setWatchlist] = useState<number[]>([]);
  const [user, setUser] = useState<{ id: string; role: string } | null | undefined>(undefined);
  const stripRef = useRef<HTMLDivElement>(null);
  const showing = useMemo(() => movies.filter(movie => movie.status === "now showing"), [movies]);
  const soon = useMemo(() => movies.filter(movie => movie.status === "coming soon"), [movies]);
  const list = activeTab === "showing" ? showing : soon;

  useEffect(() => {
    fetch("/api/auth/me").then(async response => {
      if (!response.ok) return setUser(null);
      const result = await response.json();
      const current = result?.user;
      setUser(current?.role === "customer" ? current : null);
    });
  }, []);

  useEffect(() => {
    if (user === undefined || user === null) return;
    fetch("/api/account/watchlist").then(async response => {
      if (!response.ok) return;
      const result = await response.json();
      setWatchlist(result?.ids ?? []);
    });
  }, [user]);

  const toggleWatch = async (event: React.MouseEvent, movie: MovieWithShowtimes) => {
    event.stopPropagation();
    if (!user) return router.push("/signin?next=/");
    const saved = watchlist.includes(movie.id);
    setWatchlist(current => saved ? current.filter(id => id !== movie.id) : [...current, movie.id]);
    const response = await fetch("/api/account/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ movieId: movie.id }) });
    if (!response.ok) setWatchlist(current => saved ? [...current, movie.id] : current.filter(id => id !== movie.id));
  };

  const updateBounds = () => {
    const strip = stripRef.current;
    if (!strip) return;
    const maxScroll = strip.scrollWidth - strip.clientWidth - 4;
    setReachedEnds({ start: strip.scrollLeft <= 4, end: strip.scrollLeft >= maxScroll });
  };

  const scrollByCards = (direction: -1 | 1) => {
    const strip = stripRef.current;
    if (!strip) return;
    const card = strip.querySelector<HTMLElement>(".movie-card");
    const step = (card?.offsetWidth ?? 180) * 2.5 + 16;
    strip.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  useEffect(() => {
    setReachedEnds({ start: true, end: false });
    const raf = requestAnimationFrame(updateBounds);
    return () => cancelAnimationFrame(raf);
  }, [list]);

  return <div className="browse">
    <div className="browse-tabs" role="tablist" aria-label="Films">
      <button type="button" role="tab" id="browse-tab-showing" aria-selected={activeTab === "showing"} className={`browse-tab${activeTab === "showing" ? " active" : ""}`} onClick={() => onTabChange("showing")}>Now Showing<span className="browse-tab-count">{showing.length}</span></button>
      <button type="button" role="tab" id="browse-tab-soon" aria-selected={activeTab === "soon"} className={`browse-tab${activeTab === "soon" ? " active" : ""}`} onClick={() => onTabChange("soon")}>Coming Soon<span className="browse-tab-count">{soon.length}</span></button>
    </div>
    <div className="movie-strip-wrap" key={activeTab}>
      <button type="button" className="movie-strip-arrow prev" disabled={reachedEnds.start || list.length === 0} onClick={() => scrollByCards(-1)} aria-label="Previous films">←</button>
      <div className="movie-strip browse-grid" ref={stripRef} onScroll={updateBounds} role="list">
        {list.map(item => {
          const bookable = (item.showtimes?.length ?? 0) > 0;
          const showtimeTimes = [...(item.showtimes ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(0, 4).map(showtime => clock(showtime.startTime));
          const showtimeTotal = item.showtimes?.length ?? 0;
          const saved = watchlist.includes(item.id);
          return <article key={item.id} className={`movie-card${selectedId === item.id ? " chosen" : ""}${activeTab === "soon" || !bookable ? " not-bookable" : ""}`} onClick={() => { if (activeTab === "showing" && bookable) onSelect(item); }}>
            <div className="movie-poster" style={{ backgroundImage: `url('${item.posterUrl}')` }}>
              <span className="experience">{item.experience ?? "Standard"}</span>
              {user && <button type="button" className={`heart-button${saved ? " on" : ""}`} aria-label={saved ? `Remove ${item.title} from watchlist` : `Save ${item.title} to watchlist`} aria-pressed={saved} onClick={event => toggleWatch(event, item)}>{saved ? "♥" : "♡"}</button>}
              {item.trailerUrl && <button type="button" className="trailer-button" onClick={event => { event.stopPropagation(); setTrailer({ movie: item, trigger: event.currentTarget }); }}>▶ Watch trailer</button>}
              {activeTab === "soon" && item.releaseDate && <span className="movie-releases">Releases {new Date(item.releaseDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
            </div>
            <div className="movie-info">
              <h3>{item.title}</h3>
              <p>{item.rating ?? "PG-13"} · {Math.floor(item.durationMinutes / 60)}h {item.durationMinutes % 60}m{item.avgRating ? ` · ★ ${item.avgRating.toFixed(1)}` : ""}</p>
              {activeTab === "showing" && bookable && <span className="movie-price">{peso(item.basePrice ?? 450)}</span>}
            </div>
            {activeTab === "showing"
              ? bookable
                ? <div className="movie-showtimes">{showtimeTimes.map(time => <span className="movie-chip" key={time}>{time}</span>)}{showtimeTotal > 4 && <span className="movie-chip more">+{showtimeTotal - 4}</span>}</div>
                : <div className="movie-showtimes"><span className="movie-chip">No showtimes yet</span></div>
              : <div className="movie-showtimes"><span className="movie-chip">{item.releaseDate ? new Date(item.releaseDate).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "Date to be announced"}</span></div>}
          </article>;
        })}
        {list.length === 0 && <p className="browse-empty">Nothing to book {activeTab === "showing" ? "right now" : "just yet"} — check back soon.</p>}
      </div>
      <button type="button" className="movie-strip-arrow next" disabled={reachedEnds.end || list.length === 0} onClick={() => scrollByCards(1)} aria-label="Next films">→</button>
    </div>
    {trailer && <TrailerModal title={trailer.movie.title} url={trailer.movie.trailerUrl!} trigger={trailer.trigger} onClose={() => setTrailer(null)} />}
  </div>;
}