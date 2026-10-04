import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
import { apiFetch, errorMessage } from "../../lib/api/client";
import { peso } from "../../lib/types";
import type { MovieWithShowtimes } from "../../lib/types";

const TABS = [
  ["now showing", "Now Showing"],
  ["coming soon", "Coming Soon"]
] as const;

export default function MoviesIndex() {
  const [movies, setMovies] = useState<MovieWithShowtimes[] | null>(null);
  const [status, setStatus] = useState<(typeof TABS)[number][0]>("now showing");
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<MovieWithShowtimes[]>("/api/movies")
      .then(list => { if (active) setMovies(list); })
      .catch(err => { if (active) setError(errorMessage(err, "We couldn't load the film list.")); });
    return () => { active = false; };
  }, []);

  const genres = useMemo(() => {
    const found = new Set<string>();
    for (const movie of movies ?? []) if (movie.genre) found.add(movie.genre);
    return [...found].sort();
  }, [movies]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (movies ?? []).filter(movie => {
      if (movie.status !== status) return false;
      if (genre !== "all" && movie.genre !== genre) return false;
      if (!term) return true;
      return [movie.title, movie.genre, movie.cast, movie.synopsis, ...(movie.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [movies, status, query, genre]);

  return (
    <>
      <Head>
        <title>All films | CinemaBooking</title>
        <meta name="description" content="Every film showing at CinemaBooking, with runtimes, ratings, prices and showtimes." />
      </Head>
      <SiteHeader />

      <main className="shell films-page">
        <div className="section-heading">
          <div>
            <p className="kicker">THE LINEUP</p>
            <h1>All films</h1>
            <p className="section-intro">Everything on the big screen this season.</p>
          </div>
        </div>

        <div className="browse-tabs" role="tablist" aria-label="Film status">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={status === value}
              className={`browse-tab${status === value ? " active" : ""}`}
              onClick={() => setStatus(value)}
            >
              {label}
              <span className="browse-tab-count">{(movies ?? []).filter(movie => movie.status === value).length}</span>
            </button>
          ))}
        </div>

        <div className="browse-filters">
          <label className="browse-search">
            <span className="sr-only">Search films</span>
            <input type="search" value={query} placeholder="Search by title, genre or cast…" onChange={event => setQuery(event.target.value)} />
          </label>
          {genres.length > 1 && (
            <label className="browse-select">
              <span className="sr-only">Filter by genre</span>
              <select value={genre} onChange={event => setGenre(event.target.value)}>
                <option value="all">All genres</option>
                {genres.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          )}
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        {movies === null ? (
          <div className="watch-grid" aria-busy="true">
            {[0, 1, 2, 3].map(index => <div className="skeleton skeleton-card" key={index} />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="summary-card empty-state">
            <h2>No films found</h2>
            <p className="muted">Try a different search or clear the filters.</p>
            <button className="button" onClick={() => { setQuery(""); setGenre("all"); }}>Clear filters</button>
          </div>
        ) : (
          <div className="watch-grid">
            {visible.map(movie => (
              <article className="watch-card" key={movie.id}>
                <Link href={`/movies/${movie.id}`}>
                  <div className="watch-poster" style={{ backgroundImage: `url('${movie.posterUrl}')` }}>
                    <span className="experience">{movie.experience ?? "Standard"}</span>
                    {movie.status === "coming soon" && movie.releaseDate && (
                      <span className="movie-releases">Releases {new Date(movie.releaseDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    )}
                  </div>
                  <div className="watch-info">
                    <h3>{movie.title}</h3>
                    <p className="muted">
                      {movie.rating ?? "PG-13"} · {Math.floor(movie.durationMinutes / 60)}h {movie.durationMinutes % 60}m
                      {movie.genre ? ` · ${movie.genre}` : ""}
                      {typeof movie.avgRating === "number" ? ` · ★ ${movie.avgRating.toFixed(1)}` : ""}
                    </p>
                    <span className="muted">
                      {movie.status === "coming soon"
                        ? "Coming soon"
                        : `${movie.showtimes?.length ?? 0} showtime${movie.showtimes?.length === 1 ? "" : "s"} · from ${peso(movie.basePrice ?? 450)}`}
                    </span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}