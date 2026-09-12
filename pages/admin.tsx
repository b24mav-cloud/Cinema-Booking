import { FormEvent, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { SiteHeader } from "../components/SiteHeader";
import { showtimeToIso } from "../lib/api/cinema";
import type { Movie, ShowtimeDraft } from "../lib/types";

type AuditoriumStatus = "Open" | "Maintenance" | "Closed";
type AuditoriumSummary = { id: number; name: string; type: "regular" | "vip"; status: AuditoriumStatus; seatCount: number };
type Dashboard = { moviesCurrentlyShowing: number; upcomingMovies: number; archivedMovies: number; todaysBookings: number; auditoriumsOpen: number; auditoriumsTotal: number; auditoriums: AuditoriumSummary[] };
type AdminMovie = Movie & { showtimeCount: number; showtimes: { id: number; startTime: string; endTime?: string; auditorium: string; auditoriumId?: number }[] };
type EditorForm = { id: number | null; title: string; genre: string; runtime: string; status: string; cast: string; description: string; posterUrl: string; posterName: string; trailerUrl: string; showtimes: ShowtimeDraft[]; errors: Record<string, string> };

const STATUS_LABELS: Record<string, string> = { "now showing": "Now showing", "coming soon": "Coming soon", archived: "Archived" };
const STATUS_CODES: Record<string, string> = { "now showing": "showing", "coming soon": "soon", archived: "archived" };
const AUDITORIUM_STATUS: AuditoriumStatus[] = ["Open", "Maintenance", "Closed"];

const emptyForm: EditorForm = { id: null, title: "", genre: "", runtime: "", status: "coming soon", cast: "", description: "", posterUrl: "", posterName: "", trailerUrl: "", showtimes: [], errors: {} };

const utcParts = (iso: string) => {
  const date = new Date(iso);
  return {
    date: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
    time: `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`
  };
};

export default function Admin() {
  const router = useRouter();
  const [stats, setStats] = useState<Dashboard>();
  const [movies, setMovies] = useState<AdminMovie[]>([]);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState<EditorForm | null>(null);
  const [pendingStatus, setPendingStatus] = useState<Record<number, AuditoriumStatus>>({});
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };
  const load = () => {
    Promise.all([fetch("/api/admin/dashboard"), fetch("/api/admin/movies")]).then(async ([dashboard, catalogue]) => {
      if (!dashboard.ok || !catalogue.ok) return router.replace("/signin?next=/admin");
      setStats(await dashboard.json());
      setMovies(await catalogue.json());
    });
  };
  useEffect(load, [router]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const cards = stats && [
    ["Now showing", stats.moviesCurrentlyShowing],
    ["Upcoming", stats.upcomingMovies],
    ["Archived", stats.archivedMovies],
    ["Today's bookings", stats.todaysBookings],
    ["Auditoriums open", `${stats.auditoriumsOpen}/${stats.auditoriumsTotal}`]
  ];

  const signOut = async () => { await fetch("/api/auth/signout", { method: "POST" }); router.push("/"); };

  const setField = (patch: Partial<EditorForm>) => setForm(current => current ? { ...current, ...patch, errors: { ...current.errors, ...rest(patch) } } : current);
  const rest = (patch: Partial<EditorForm>): Record<string, string> => Object.fromEntries(Object.keys(patch).map(key => [key, ""]));

  const startNew = () => setForm({ ...emptyForm });
  const startEdit = (movie: AdminMovie) => setForm({ id: movie.id, title: movie.title, genre: movie.genre ?? "", runtime: String(movie.durationMinutes), status: movie.status ?? "coming soon", cast: movie.cast ?? "", description: movie.description ?? "", posterUrl: movie.posterUrl, posterName: "", trailerUrl: movie.trailerUrl ?? "", showtimes: (movie.showtimes ?? []).map(item => ({ key: `s-${item.id}`, id: item.id, auditoriumId: item.auditoriumId ?? undefined, date: utcParts(item.startTime).date, time: utcParts(item.startTime).time, errors: {} })), errors: {} });

  const addShowtime = () => setForm(current => current ? { ...current, showtimes: [...current.showtimes, { key: `n-${Date.now()}-${current.showtimes.length}`, auditoriumId: undefined, date: "", time: "", errors: {} }] } : current);
  const removeShowtime = (key: string) => setForm(current => current ? { ...current, showtimes: current.showtimes.filter(row => row.key !== key), errors: Object.fromEntries(Object.entries(current.errors).filter(([field]) => !/^showtime-\d+$/.test(field))) } : current);
  const updateShowtime = (key: string, patch: Partial<ShowtimeDraft>) => setForm(current => {
    if (!current) return current;
    const index = current.showtimes.findIndex(row => row.key === key);
    return {
      ...current,
      showtimes: current.showtimes.map(row => row.key === key ? { ...row, ...patch } : row),
      errors: Object.fromEntries(Object.entries(current.errors).filter(([field]) => field !== `showtime-${index}`))
    };
  });

  const onPoster = (file: File | undefined) => {
    if (!file || !form) return;
    const errors = { ...form.errors, poster: "" };
    if (!file.type.startsWith("image/")) errors.poster = "The poster must be an image file.";
    else if (file.size > 1_500_000) errors.poster = "Poster is too large — pick an image under 1.5MB.";
    else {
      const reader = new FileReader();
      reader.onload = () => setForm(current => current ? { ...current, posterUrl: String(reader.result ?? ""), posterName: file.name, errors: { ...current.errors, poster: "" } } : current);
      reader.readAsDataURL(file);
      return;
    }
    setForm({ ...form, errors });
  };

  const saveMovie = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || busy) return;
    const submitted = form.showtimes.map((row, fullIndex) => ({ fullIndex, id: row.id, auditoriumId: row.auditoriumId, date: row.date, time: row.time }))
      .filter(row => row.auditoriumId !== undefined || row.date || row.time);
    const clientErrors: Record<string, string> = {};
    submitted.forEach((row, index) => {
      const hasHall = row.auditoriumId !== undefined;
      const hasStart = !!row.date && !!row.time;
      if (hasHall && !hasStart) clientErrors[`showtime-${index}`] = "Pick a date and start time for this showtime.";
      else if (!hasHall && (row.date || row.time)) clientErrors[`showtime-${index}`] = "Choose an auditorium for this showtime.";
    });
    if (Object.keys(clientErrors).length) {
      const placed: Record<string, string> = {};
      for (const [field, message] of Object.entries(clientErrors)) placed[`showtime-${submitted[Number(field.replace("showtime-", ""))].fullIndex}`] = message;
      return setForm({ ...form, errors: placed });
    }
    setBusy(true);
    const body = { title: form.title, genre: form.genre, durationMinutes: Number(form.runtime), status: form.status, cast: form.cast, description: form.description, posterUrl: form.posterUrl, trailerUrl: form.trailerUrl, showtimes: submitted.map(row => ({ id: row.id, auditoriumId: row.auditoriumId, startTime: showtimeToIso(row.date, row.time) })) };
    try {
      const endpoint = form.id ? `/api/admin/movies/${form.id}` : "/api/admin/movies";
      const response = await fetch(endpoint, { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.status === 400) {
        const result = await response.json();
        if (result.errors) {
          const mapped: Record<string, string> = {};
          for (const [field, message] of Object.entries(result.errors)) {
            const match = /^showtime-(\d+)$/.exec(field);
            if (match) mapped[`showtime-${submitted[Number(match[1])]?.fullIndex ?? Number(match[1])}`] = String(message);
            else mapped[field] = String(message);
          }
          return setForm({ ...form, errors: mapped });
        }
      }
      if (!response.ok) throw new Error(await response.text());
      load();
      setForm(null);
      notify(form.id ? "Movie updated." : "Movie added.");
    } catch (err) {
      setForm({ ...form, errors: { ...form.errors, form: err instanceof Error ? err.message : "Could not save the movie." } });
    } finally {
      setBusy(false);
    }
  };

  const archive = async (id: number) => {
    if (!confirm("Archive this movie? It stays on record but disappears from the public site.")) return;
    const response = await fetch(`/api/admin/movies/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "archived" }) });
    if (response.ok) { load(); notify("Movie archived."); }
  };

  const saveAuditoriumStatus = async (id: number, status: AuditoriumStatus) => {
    const response = await fetch(`/api/admin/auditoriums/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) {
      setPendingStatus(pending => { const next = { ...pending }; delete next[id]; return next; });
      setStats(current => current ? { ...current, auditoriums: current.auditoriums.map(item => item.id === id ? { ...item, status } : item), auditoriumsOpen: ((current.auditoriums.map(item => item.id === id ? { ...item, status } : item)).filter(item => item.status === "Open")).length } : current);
      notify(status === "Open" ? "Auditorium is open again." : status === "Maintenance" ? "Auditorium set to maintenance — bookings are paused." : "Auditorium closed.");
    }
  };

  const auditoriumGrid = stats?.auditoriums && (
    <section>
      <div className="section-heading"><div><p className="kicker">AUDITORIUMS</p><h2>Hall status</h2></div><Link className="button back-button" href="/admin/auditorium/1">Manage seat maps →</Link></div>
      <div className="auditorium-grid">{stats!.auditoriums.map(item => {
        const pending = pendingStatus[item.id];
        const changed = pending && pending !== item.status;
        return <article className="auditorium-card" key={item.id}>
          <div className="auditorium-card-head"><h3>{item.name}</h3><span className={`type-badge ${item.type}`}>{item.type === "vip" ? "VIP" : "Regular"}</span></div>
          <p className="auditorium-seats muted">{item.seatCount} seats</p>
          <div className="status-line"><span className={`status-dot ${item.status}`} /><label className="field">Status<select value={pending ?? item.status} onChange={e => setPendingStatus(current => ({ ...current, [item.id]: e.target.value as AuditoriumStatus }))}>{AUDITORIUM_STATUS.map(status => <option value={status} key={status}>{status}</option>)}</select></label></div>
          {changed && <button className="button gold-button status-save" onClick={() => saveAuditoriumStatus(item.id, pending!)}>Save</button>}
          <Link className="manage-seats" href={`/admin/auditorium/${item.id}`}>Manage seats →</Link>
        </article>;
      })}</div>
    </section>
  );

  return <><Head><title>Admin dashboard | CinemaBooking</title></Head><SiteHeader admin /><main className="admin-page shell"><div className="d-flex justify-content-between"><div><p className="kicker">ADMIN PORTAL</p><h1>{greeting}.</h1></div><button className="button" onClick={signOut}>Sign out</button></div><p className="muted">A quick view of the cinema today.</p>
    <section className="admin-stats">{cards?.map(([label, value]) => <article className="summary-card" key={String(label)}><span className="muted">{label}</span><strong>{value}</strong></article>)}</section>
    {auditoriumGrid}
    <section className="summary-card admin-placeholder"><div className="section-heading"><div><p className="kicker">MOVIES</p><h2>Movie records</h2></div><div className="admin-actions"><select value={filter} onChange={e => setFilter(e.target.value)}><option value="">All statuses</option><option value="now showing">Now showing</option><option value="coming soon">Coming soon</option><option value="archived">Archived</option></select><button className="button gold-button" onClick={startNew}>+ Add movie</button></div></div>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Poster</th><th>Title</th><th>Status</th><th>Runtime</th><th /></tr></thead><tbody>{movies.filter(item => !filter || item.status === filter).map(item => <tr key={item.id}><td>{item.posterUrl ? <img className="movie-poster-thumb" src={item.posterUrl} alt="" /> : <span className="movie-poster-thumb empty">—</span>}</td><td>{item.title}</td><td><span className={`status-badge ${STATUS_CODES[item.status ?? ""] ?? "soon"}`}>{STATUS_LABELS[item.status ?? "coming soon"] ?? item.status}</span> <span className={`showtime-count${item.showtimeCount === 0 ? " zero" : ""}`}>{item.showtimeCount} showtime{item.showtimeCount === 1 ? "" : "s"}</span></td><td>{item.durationMinutes} min</td><td><div className="admin-actions">{item.status !== "archived" && <button className="button back-button" onClick={() => archive(item.id)}>Archive</button>}<button className="button gold-button" onClick={() => startEdit(item)}>Edit</button></div></td></tr>)}</tbody></table></div>
    {form && <form className="movie-editor" onSubmit={saveMovie}><div className="section-heading"><div><p className="kicker">{form.id ? "EDIT MOVIE" : "NEW MOVIE"}</p><h2>{form.id ? form.title || "Edit movie" : "Add a movie"}</h2></div></div>
      <div className="form-row"><label className="field">Title<input value={form.title} onChange={e => setField({ title: e.target.value })} placeholder="e.g. Inception" />{form.errors.title && <span className="field-error">{form.errors.title}</span>}</label>
      <label className="field">Genre<input value={form.genre} onChange={e => setField({ genre: e.target.value })} placeholder="e.g. Sci-fi" />{form.errors.genre && <span className="field-error">{form.errors.genre}</span>}</label></div>
      <div className="form-row"><label className="field">Runtime (minutes)<input type="number" min={1} value={form.runtime} onChange={e => setField({ runtime: e.target.value })} />{form.errors.runtime && <span className="field-error">{form.errors.runtime}</span>}</label>
      <label className="field">Status<select value={form.status} onChange={e => setField({ status: e.target.value })}><option value="coming soon">Coming soon</option><option value="now showing">Now showing</option><option value="archived">Archived</option></select>{form.errors.status && <span className="field-error">{form.errors.status}</span>}</label></div>
      <div className="form-row"><label className="field">Cast<input value={form.cast} onChange={e => setField({ cast: e.target.value })} placeholder="e.g. Leonardo DiCaprio" /></label>
        <label className="field">Short description<textarea rows={3} value={form.description} onChange={e => setField({ description: e.target.value })} placeholder="A one-liner shown to your viewers." /></label></div>
      <div className="field"><span className="poster-label">Trailer link{" "}<span className="muted">optional — YouTube or any video URL</span></span><input type="url" value={form.trailerUrl} onChange={e => setField({ trailerUrl: e.target.value })} placeholder="https://youtube.com/watch?v=..." />{form.errors.trailer && <span className="field-error">{form.errors.trailer}</span>}</div>
      <div className="showtime-editor"><div><p className="kicker">SHOWTIMES</p><h3 className="showtime-title">When can this movie be seen?</h3></div>
        {form.showtimes.length === 0 && <p className="showtime-note">Add a showtime to make this movie bookable.</p>}
        <div className="showtime-rows">{form.showtimes.map((row, index) => <div className="showtime-row" key={row.key}>
          <label className="field">Auditorium<select value={row.auditoriumId ?? ""} onChange={e => updateShowtime(row.key, { auditoriumId: e.target.value ? Number(e.target.value) : undefined })}><option value="">Choose auditorium</option>{(stats?.auditoriums ?? []).map(auditorium => <option value={auditorium.id} key={auditorium.id} disabled={auditorium.status !== "Open"}>{auditorium.name}{auditorium.type === "vip" ? " · VIP" : ""}{auditorium.status !== "Open" ? ` (${auditorium.status === "Maintenance" ? "under maintenance" : "closed"})` : ""}</option>)}</select>{form.errors[`showtime-${index}`] && <span className="field-error">{form.errors[`showtime-${index}`]}</span>}</label>
          <label className="field">Date<input type="date" value={row.date} onChange={e => updateShowtime(row.key, { date: e.target.value })} /></label>
          <label className="field">Start time<input type="time" value={row.time} onChange={e => updateShowtime(row.key, { time: e.target.value })} /></label>
          <button type="button" className="showtime-remove" onClick={() => removeShowtime(row.key)} aria-label={`Remove showtime ${index + 1}`}>✕</button>
        </div>)}</div>
        <div className="showtime-actions"><button type="button" className="button back-button showtime-add" onClick={addShowtime}>+ Add showtime</button></div>
      </div>
      <div className="field"><span className="poster-label">Poster image{" "}<span className="muted">JPG/PNG under 1.5MB</span></span><div className={`dropzone ${dragging ? "dragging" : ""}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); onPoster(e.dataTransfer.files?.[0]); }}><input className="dropzone-input" type="file" accept="image/*" onChange={e => onPoster(e.target.files?.[0])} /><span>Drop a poster here or click to browse</span>{form.posterUrl && form.posterUrl.startsWith("data:") && <img src={form.posterUrl} alt="Poster preview" />}</div>{form.errors.poster && <span className="field-error">{form.errors.poster}</span>}</div>
      {form.errors.form && <p className="error">{form.errors.form}</p>}
      <div className="editor-actions"><button type="button" className="button back-button" onClick={() => setForm(null)}>Cancel</button>{form.id && form.status !== "archived" && <button type="button" className="button button-archive" onClick={() => archive(form.id!)}>Archive</button>}<button className="button gold-button" type="submit" disabled={busy}>{busy ? "Saving…" : form.id ? "Save changes" : "Add movie"}</button></div>
    </form>}
    </section>
    {toast && <div className="toast">{toast}</div>}
  </main></>;
}