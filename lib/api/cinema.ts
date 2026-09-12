import type { Auditorium, Movie, MovieWithShowtimes, Seat, Showtime, ShowtimeWithMovie, Store } from "../types";
import { isWellFormedUrl } from "../trailers";

export const showtimeToIso = (date: string, time: string): string | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? "").trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec((time ?? "").trim());
  if (!match || !timeMatch) return undefined;
  const iso = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(timeMatch[1]), Number(timeMatch[2]))).toISOString();
  return Number.isNaN(Date.parse(iso)) ? undefined : iso;
};

export const showtimeEnd = (startIso: string, durationMinutes: number): string =>
  new Date(new Date(startIso).getTime() + durationMinutes * 60000).toISOString();

export const formatClock = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

export type ShowtimeDraftInput = {
  id?: number;
  auditoriumId?: number;
  startTime?: string;
};

export function buildShowtime(store: Store, movie: Movie, input: ShowtimeDraftInput, existing?: Showtime, nextId?: number): { showtime?: Showtime; error?: string } {
  const template = store.auditoriums.find(item => item.id === Number(input.auditoriumId));
  if (!template) return { error: "Choose an auditorium." };
  if (template.status !== "Open" && !(existing && existing.auditoriumId === template.id)) {
    return { error: template.status === "Maintenance" ? `${template.name} is under maintenance and can't take new showtimes.` : `${template.name} is closed and can't take new showtimes.` };
  }
  const startTime = input.startTime ?? "";
  if (!startTime || Number.isNaN(Date.parse(startTime))) return { error: "Pick a date and start time." };
  const id = nextId ?? existing?.id ?? Math.max(0, ...store.showtimes.map(item => item.id)) + 1;
  const keepSeats = existing && existing.auditorium === template.name;
  const price = existing?.price ?? template.seats[0]?.price ?? 450;
  const seats: Seat[] = keepSeats
    ? existing!.seats.map(seat => ({ ...seat, price, variant: seat.variant ?? (template.type === "vip" ? "recliner" : "standard") }))
    : template.seats.map((seat, i) => {
        const next: Seat = { id: id * 100 + i + 1, row: seat.row, number: seat.number, price, status: seat.status === "OutOfService" ? "OutOfService" : "Available", variant: template.type === "vip" ? "recliner" : "standard" };
        return next;
      });
  const showtime: Showtime = {
    id,
    movieId: movie.id,
    startTime: new Date(startTime).toISOString(),
    endTime: showtimeEnd(startTime, movie.durationMinutes),
    auditorium: template.name,
    auditoriumId: template.id,
    auditoriumType: template.type,
    experience: existing?.experience ?? (template.type === "vip" ? "Premium" : "Standard"),
    price,
    seats
  };
  return { showtime };
}

const overlaps = (a: Showtime, b: Showtime): boolean => {
  const sameHall = a.auditoriumId !== undefined && b.auditoriumId !== undefined ? a.auditoriumId === b.auditoriumId : a.auditorium === b.auditorium;
  if (!sameHall) return false;
  const aStart = new Date(a.startTime).getTime();
  const aEnd = new Date(a.endTime ?? showtimeEnd(a.startTime, 0)).getTime();
  const bStart = new Date(b.startTime).getTime();
  const bEnd = new Date(b.endTime ?? showtimeEnd(b.startTime, 0)).getTime();
  return aStart < bEnd && bStart < aEnd;
};

export function validateShowtimes(store: Store, movie: Movie, candidates: Showtime[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const others = store.showtimes.filter(item => item.movieId !== movie.id);
    for (const scheduled of others) {
      if (!overlaps(candidate, scheduled)) continue;
      errors[`showtime-${i}`] = `${scheduled.auditorium} is already booked for ${store.movies.find(item => item.id === scheduled.movieId)?.title ?? "another movie"} from ${formatClock(scheduled.startTime)}–${formatClock(scheduled.endTime ?? scheduled.startTime)} on ${formatDate(candidate.startTime)}.`;
      break;
    }
    if (errors[`showtime-${i}`]) continue;
    for (let j = 0; j < i; j++) {
      if (overlaps(candidate, candidates[j])) {
        errors[`showtime-${i}`] = `${candidate.auditorium} already has a showtime for this movie from ${formatClock(candidates[j].startTime)}–${formatClock(candidates[j].endTime ?? candidates[j].startTime)} on ${formatDate(candidate.startTime)}.`;
        break;
      }
    }
  }
  return errors;
}

export function validateShowtimeDrafts(store: Store, movie: Movie, drafts: ShowtimeDraftInput[]): { errors: Record<string, string>; showtimes?: Showtime[] } {
  const errors: Record<string, string> = {};
  const candidates: Showtime[] = [];
  let nextId = Math.max(0, ...store.showtimes.map(item => item.id)) + 1;
  drafts.forEach((draft, index) => {
    if (errors[`showtime-${index}`]) return;
    const hasHall = draft.auditoriumId !== undefined && draft.auditoriumId !== null;
    const hasStart = !!draft.startTime;
    if (hasHall && !hasStart) { errors[`showtime-${index}`] = "Pick a date and start time for this showtime."; return; }
    if (!hasHall && hasStart) { errors[`showtime-${index}`] = "Choose an auditorium for this showtime."; return; }
    if (!hasHall && !hasStart) { errors[`showtime-${index}`] = "Choose an auditorium, date, and start time."; return; }
    const existing = draft.id === undefined ? undefined : store.showtimes.find(item => item.id === draft.id && item.movieId === movie.id);
    const result = buildShowtime(store, movie, draft, existing, draft.id === undefined ? nextId++ : undefined);
    if (result.error) { errors[`showtime-${index}`] = result.error; return; }
    candidates.push(result.showtime!);
  });
  if (Object.keys(errors).length) return { errors };
  const conflicts = validateShowtimes(store, movie, candidates);
  return { errors: conflicts, showtimes: Object.keys(conflicts).length ? undefined : candidates };
}

export const decorateMovie = (movie: Movie, store: Store): MovieWithShowtimes => ({
  ...movie,
  showtimes: store.showtimes.filter(item => item.movieId === movie.id && isAuditoriumOpen(store, item.auditorium))
});

export const decorateShowtime = (showtime: Showtime, store: Store): ShowtimeWithMovie => ({
  ...showtime,
  movie: store.movies.find(item => item.id === showtime.movieId) ?? null
});

export const isAuditoriumOpen = (store: Store, name: string): boolean =>
  (store.auditoriums.find(auditorium => auditorium.name === name)?.status ?? "Open") === "Open";

export function syncAuditoriumSeats(store: Store, auditorium: Auditorium): number {
  let synced = 0;
  for (const showtime of store.showtimes) {
    if (showtime.auditorium !== auditorium.name) continue;
    const previous = new Map(showtime.seats.map(seat => [`${seat.row}:${seat.number}`, seat]));
    const price = showtime.price ?? auditorium.seats[0]?.price ?? 450;
    showtime.seats = auditorium.seats.map((template, i) => {
      const existing = previous.get(`${template.row}:${template.number}`);
      return {
        id: showtime.id * 100 + i + 1,
        showtimeId: showtime.id,
        row: template.row,
        number: template.number,
        price: existing?.price ?? price,
        status: template.status === "OutOfService" && existing?.status !== "Reserved" ? "OutOfService" : (existing?.status ?? template.status),
        variant: template.variant
      } as Seat;
    });
    synced += 1;
  }
  return synced;
}

export function validateMovieInput(input: { title?: string; genre?: string; durationMinutes?: number; status?: string; cast?: string; description?: string; posterUrl?: string; trailerUrl?: string }) {
  const errors: Record<string, string> = {};
  const statuses = ["now showing", "coming soon", "archived"];
  const title = input.title?.trim() ?? "";
  if (!title) errors.title = "Title is required.";
  const genre = input.genre?.trim() ?? "";
  if (!genre) errors.genre = "Genre is required.";
  const durationMinutes = Number(input.durationMinutes ?? 0);
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) errors.runtime = "Runtime must be a positive number of minutes.";
  const status = input.status?.trim() ?? "coming soon";
  if (!statuses.includes(status)) errors.status = "Choose a valid status.";
  const cast = input.cast?.trim() ?? "";
  const description = input.description?.trim() ?? "";
  const posterUrl = input.posterUrl?.trim() ?? "";
  if (posterUrl && !/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(posterUrl) && !/^https?:\/\//i.test(posterUrl)) errors.poster = "Poster must be an image file or a URL.";
  if (posterUrl.length > 2_100_000) errors.poster = "Poster is too large — upload an image under 1.5MB.";
  const trailerUrl = input.trailerUrl?.trim() ?? "";
  if (trailerUrl && !isWellFormedUrl(trailerUrl)) errors.trailer = "Trailer link must be a valid URL (https://...).";
  if (Object.keys(errors).length) return { errors };
  return { errors: {}, values: { title, genre, durationMinutes, status, cast, description, posterUrl, trailerUrl } };
}

export type NewShowtimeInput = {
  movieId?: number;
  startTime?: string;
  auditorium?: string;
  auditoriumType?: string;
  seats?: { row: string; number: number; price: number }[];
};

export function createShowtime(store: Store, input: NewShowtimeInput): { error?: string; status?: number; showtime?: Showtime } {
  if (!input || !Number.isInteger(input.movieId) || !store.movies.some(movie => movie.id === input.movieId)) {
    return { error: "Movie does not exist.", status: 400 };
  }
  const auditorium = input.auditorium ?? "";
  const template = store.auditoriums.find(item => item.name === auditorium);
  const auditoriumType = template?.type ?? (input.auditoriumType === "vip" || auditorium.toLowerCase().includes("vip") ? "vip" : "regular");
  const id = Math.max(0, ...store.showtimes.map(item => item.id)) + 1;
  const nextId = id;
  let seats: Seat[];
  if (template?.seats.length) {
    seats = template.seats.map((seat, i) => {
      const next: Seat = { id: nextId * 100 + i + 1, row: seat.row, number: seat.number, price: seat.price, status: "Available", variant: seat.variant };
      if (seat.status === "OutOfService") next.status = "OutOfService";
      return next;
    });
  } else {
    const fallback = input.seats?.length
      ? input.seats
      : Array.from({ length: auditoriumType === "vip" ? 12 : 30 }, (_, i) => ({ row: String.fromCharCode(65 + Math.floor(i / (auditoriumType === "vip" ? 6 : 10))), number: i % (auditoriumType === "vip" ? 6 : 10) + 1, price: auditoriumType === "vip" ? 780 : 10 }));
    seats = fallback.map((seat, i) => ({ id: nextId * 100 + i + 1, row: seat.row, number: seat.number, price: Number(seat.price) || 10, status: "Available" }));
  }
  const showtime: Showtime = {
    id: nextId,
    movieId: input.movieId as number,
    startTime: new Date(input.startTime ?? Date.now()).toISOString(),
    endTime: showtimeEnd(input.startTime ?? new Date().toISOString(), store.movies.find(movie => movie.id === input.movieId)?.durationMinutes ?? 0),
    auditorium,
    auditoriumId: template?.id,
    auditoriumType,
    seats
  };
  return { showtime };
}
