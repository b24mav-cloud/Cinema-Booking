import type { Auditorium, Movie, MovieWithShowtimes, Seat, Showtime, ShowtimeWithMovie, Store } from "../types";

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

export function validateMovieInput(input: { title?: string; genre?: string; durationMinutes?: number; status?: string; cast?: string; description?: string; posterUrl?: string }) {
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
  if (Object.keys(errors).length) return { errors };
  return { errors: {}, values: { title, genre, durationMinutes, status, cast, description, posterUrl } };
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
    auditorium,
    auditoriumType,
    seats
  };
  return { showtime };
}
