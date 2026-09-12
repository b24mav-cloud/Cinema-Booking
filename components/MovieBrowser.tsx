import { useMemo, useState } from "react";
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
  const [trailer, setTrailer] = useState<{ movie: MovieWithShowtimes; trigger: HTMLButtonElement | null } | null>(null);
  const showing = useMemo(() => movies.filter(movie => movie.status === "now showing"), [movies]);
  const soon = useMemo(() => movies.filter(movie => movie.status === "coming soon"), [movies]);
  const list = activeTab === "showing" ? showing : soon;

  return <div className="browse">
    <div className="browse-tabs" role="tablist" aria-label="Films">
      <button type="button" role="tab" id="browse-tab-showing" aria-selected={activeTab === "showing"} className={`browse-tab${activeTab === "showing" ? " active" : ""}`} onClick={() => onTabChange("showing")}>Now Showing<span className="browse-tab-count">{showing.length}</span></button>
      <button type="button" role="tab" id="browse-tab-soon" aria-selected={activeTab === "soon"} className={`browse-tab${activeTab === "soon" ? " active" : ""}`} onClick={() => onTabChange("soon")}>Coming Soon<span className="browse-tab-count">{soon.length}</span></button>
    </div>
    <div className="movie-grid browse-grid" key={activeTab}>
      {list.map(item => {
        const bookable = (item.showtimes?.length ?? 0) > 0;
        const showtimeTimes = [...(item.showtimes ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(0, 4).map(showtime => clock(showtime.startTime));
        const showtimeTotal = item.showtimes?.length ?? 0;
        return <article key={item.id} className={`movie-card${selectedId === item.id ? " chosen" : ""}${activeTab === "soon" || !bookable ? " not-bookable" : ""}`} onClick={() => { if (activeTab === "showing" && bookable) onSelect(item); }}>
          <div className="movie-poster" style={{ backgroundImage: `url('${item.posterUrl}')` }}>
            <span className="experience">{item.experience ?? "Standard"}</span>
            {item.trailerUrl && <button type="button" className="trailer-button" onClick={event => { event.stopPropagation(); setTrailer({ movie: item, trigger: event.currentTarget }); }}>▶ Watch trailer</button>}
            {activeTab === "soon" && item.releaseDate && <span className="movie-releases">Releases {new Date(item.releaseDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>}
          </div>
          <div className="movie-info">
            <div><h3>{item.title}</h3><p>{item.rating ?? "PG-13"} · {Math.floor(item.durationMinutes / 60)}h {item.durationMinutes % 60}m</p></div>
            {activeTab === "showing" && bookable && <span className="movie-price">from {peso(item.basePrice ?? 450)}</span>}
          </div>
          {activeTab === "showing"
            ? bookable
              ? <div className="movie-showtimes">{showtimeTimes.map(time => <span className="movie-chip" key={time}>{time}</span>)}{showtimeTotal > 4 && <span className="movie-chip more">+{showtimeTotal - 4} more</span>}</div>
              : <p className="movie-tags"><span>No showtimes yet</span></p>
            : <p className="movie-tags">{item.releaseDate ? <span>{new Date(item.releaseDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span> : <span>Date to be announced</span>}</p>}
        </article>;
      })}
      {list.length === 0 && <p className="browse-empty">Nothing to book {activeTab === "showing" ? "right now" : "just yet"} — check back soon.</p>}
    </div>
    {trailer && <TrailerModal title={trailer.movie.title} url={trailer.movie.trailerUrl!} trigger={trailer.trigger} onClose={() => setTrailer(null)} />}
  </div>;
}