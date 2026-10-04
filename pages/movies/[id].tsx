import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
import { TrailerModal } from "../../components/TrailerModal";
import { apiFetch, apiPost, errorMessage } from "../../lib/api/client";
import { peso } from "../../lib/types";
import type { MovieWithShowtimes, ShowtimeWithMovie } from "../../lib/types";

type Props = {
  movie: MovieWithShowtimes;
  showtimes: ShowtimeWithMovie[];
  related: { id: number; title: string; posterUrl: string; basePrice?: number }[];
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/** Groups showtimes into date buckets so the schedule reads like a cinema board. */
function groupByDate(showtimes: ShowtimeWithMovie[]) {
  const groups = new Map<string, ShowtimeWithMovie[]>();
  for (const showtime of [...showtimes].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    const key = new Date(showtime.startTime).toDateString();
    const list = groups.get(key) ?? [];
    list.push(showtime);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([date, items]) => ({ date, items }));
}

export default function MovieDetail({ movie: initial, showtimes: initialShowtimes, related }: Props) {
  const router = useRouter();
  const [movie, setMovie] = useState(initial);
  const [showtimes, setShowtimes] = useState(initialShowtimes);
  const [watchlisted, setWatchlisted] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [trailer, setTrailer] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The server render gives a fast first paint; this keeps availability fresh
  // without a full navigation.
  const refresh = useCallback(async () => {
    try {
      const [detail, all] = await Promise.all([
        apiFetch<MovieWithShowtimes>(`/api/movies/${movie.id}`),
        apiFetch<ShowtimeWithMovie[]>("/api/showtimes")
      ]);
      setMovie(detail);
      setShowtimes(all.filter(item => item.movieId === movie.id));
    } catch {
      // Keep the server-rendered data if the refresh fails.
    }
  }, [movie.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    let active = true;
    apiFetch<{ user: { email: string } | null }>("/api/auth/me")
      .then(result => {
        if (!active) return;
        const user = result?.user;
        if (!user) return;
        setSignedIn(true);
        apiFetch<{ ids: number[] }>("/api/account/watchlist")
          .then(list => { if (active) setWatchlisted((list?.ids ?? []).includes(movie.id)); })
          .catch(() => undefined);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [movie.id]);

  const toggleWatch = async () => {
    if (!signedIn) {
      router.push(`/signin?next=/movies/${movie.id}`);
      return;
    }
    setBusy(true);
    setError("");
    const next = !watchlisted;
    setWatchlisted(next);
    try {
      await apiPost("/api/account/watchlist", { movieId: movie.id });
    } catch (err) {
      setWatchlisted(!next);
      setError(errorMessage(err, "Could not update your watchlist."));
    } finally {
      setBusy(false);
    }
  };

  const groups = useMemo(() => groupByDate(showtimes), [showtimes]);
  const comingSoon = movie.status === "coming soon";
  const runtime = `${Math.floor(movie.durationMinutes / 60)}h ${movie.durationMinutes % 60}m`;
  const title = `${movie.title} | CinemaBooking`;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={movie.description || movie.synopsis || `${movie.title} — ${movie.genre ?? ""} · ${runtime}. Book seats at CinemaBooking.`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={movie.description || movie.synopsis || ""} />
        <meta property="og:type" content="video.movie" />
        {movie.posterUrl && <meta property="og:image" content={movie.posterUrl} />}
        <meta property="og:url" content={`/movies/${movie.id}`} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <SiteHeader />

      <main className="movie-detail">
        <section className="movie-hero" style={movie.posterUrl ? { backgroundImage: `url('${movie.posterUrl}')` } : undefined}>
          <div className="shell movie-hero-inner">
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <Link href="/">Home</Link> <span aria-hidden="true">/</span> <span>Films</span> <span aria-hidden="true">/</span> <span aria-current="page">{movie.title}</span>
            </nav>

            <div className="movie-hero-grid">
              <div className="movie-hero-poster">
                {movie.posterUrl ? <img src={movie.posterUrl} alt={`${movie.title} poster`} width={300} height={450} /> : <div className="poster-fallback" aria-hidden="true" />}
              </div>

              <div className="movie-hero-copy">
                <p className="kicker">{comingSoon ? "COMING SOON" : "NOW SHOWING"}</p>
                <h1>{movie.title}</h1>

                <ul className="movie-facts">
                  {movie.rating && <li>{movie.rating}</li>}
                  <li>{runtime}</li>
                  {movie.genre && <li>{movie.genre}</li>}
                  {movie.experience && <li className="experience">{movie.experience}</li>}
                  {typeof movie.avgRating === "number" && <li className="stars">★ {movie.avgRating.toFixed(1)} <small>({movie.ratingCount ?? 0})</small></li>}
                </ul>

                {movie.tags && movie.tags.length > 0 && (
                  <ul className="movie-tags">{movie.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
                )}

                <p className="movie-synopsis">{movie.description || movie.synopsis || "No synopsis available yet."}</p>

                {movie.cast && (
                  <div className="movie-cast">
                    <span className="field-label">Cast</span>
                    <p>{movie.cast}</p>
                  </div>
                )}

                {comingSoon && movie.releaseDate && (
                  <p className="release-date">Releases {new Date(movie.releaseDate).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</p>
                )}

                <div className="movie-actions">
                  {!comingSoon && showtimes.length > 0 ? (
                    <a className="button gold-button" href="#showtimes">Choose a showtime</a>
                  ) : (
                    <button className="button gold-button" onClick={toggleWatch} disabled={busy}>
                      {watchlisted ? "Saved ✓" : "Notify me"}
                    </button>
                  )}
                  {movie.trailerUrl && (
                    <button className="button" onClick={() => setTrailer(true)}>▶ Watch trailer</button>
                  )}
                  <button className="button" onClick={toggleWatch} disabled={busy} aria-pressed={watchlisted}>
                    {watchlisted ? "♥ In your watchlist" : "♡ Save for later"}
                  </button>
                </div>

                {error && <p className="error" role="alert">{error}</p>}
              </div>
            </div>
          </div>
        </section>

        <section className="shell movie-showtime-section" id="showtimes">
          <p className="kicker">SHOWTIMES</p>
          <h2>{comingSoon ? "Not in cinemas yet" : "Book your seats"}</h2>

          {comingSoon ? (
            <div className="summary-card empty-state">
              <p>{movie.releaseDate ? `This film opens ${new Date(movie.releaseDate).toLocaleDateString(undefined, { day: "numeric", month: "long" })}.` : "Release date to be announced."}</p>
              <button className="button gold-button" onClick={toggleWatch} disabled={busy}>{watchlisted ? "Saved to watchlist ✓" : "Notify me when it opens"}</button>
            </div>
          ) : groups.length === 0 ? (
            <div className="summary-card empty-state">
              <p className="muted">No screenings scheduled right now. Check back soon.</p>
              <Link className="button gold-button" href="/">See all films</Link>
            </div>
          ) : (
            groups.map(group => (
              <div className="showtime-day" key={group.date}>
                <h3 className="showtime-day-label">{dayLabel(group.items[0].startTime)}</h3>
                <div className="showtime-grid">
                  {group.items.map(item => (
                    <Link className="showtime" href={`/?showtime=${item.id}`} key={item.id}>
                      <b>{clock(item.startTime)}</b>
                      <small>{item.auditoriumType === "vip" && <span className="vip-badge">VIP</span>} {item.experience ?? "Standard"} · {item.auditorium}</small>
                      <em>from {peso(item.price ?? 450)}</em>
                    </Link>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        {related.length > 0 && (
          <section className="shell related-films">
            <p className="kicker">YOU MIGHT ALSO LIKE</p>
            <h2>More on the big screen</h2>
            <div className="watch-grid">
              {related.map(item => (
                <article className="watch-card" key={item.id}>
                  <Link href={`/movies/${item.id}`}>
                    <div className="watch-poster" style={{ backgroundImage: `url('${item.posterUrl}')` }} />
                    <div className="watch-info">
                      <h3>{item.title}</h3>
                      <span className="muted">{item.basePrice ? `from ${peso(item.basePrice)}` : "See showtimes"}</span>
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {trailer && movie.trailerUrl && (
        <TrailerModal
          title={movie.title}
          url={movie.trailerUrl}
          onClose={() => setTrailer(false)}
        />
      )}

      <SiteFooter />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ params }) => {
  const id = Number(params?.id);
  const [{ readStore }, { decorateMovie, decorateShowtime, isAuditoriumOpen }] = await Promise.all([
    import("../../lib/api/store"),
    import("../../lib/api/cinema")
  ]);
  const store = await readStore();

  const movie = store.movies.find(item => item.id === id && item.status !== "archived");
  if (!movie) return { notFound: true };

  const showtimes = store.showtimes
    .filter(item => item.movieId === movie.id && isAuditoriumOpen(store, item.auditorium))
    .map(item => decorateShowtime(item, store));

  const related = store.movies
    .filter(item => item.id !== movie.id && item.status !== "archived")
    .sort((a, b) => (b.status === movie.status ? 1 : -1))
    .slice(0, 4)
    .map(item => ({ id: item.id, title: item.title, posterUrl: item.posterUrl, basePrice: item.basePrice }));

  return { props: { movie: decorateMovie(movie, store), showtimes, related } };
};