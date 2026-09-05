import type { Movie, MovieWithShowtimes, Showtime, ShowtimeWithMovie, Store } from "../types";

export const decorateMovie = (movie: Movie, store: Store): MovieWithShowtimes => ({
  ...movie,
  showtimes: store.showtimes.filter(item => item.movieId === movie.id)
});

export const decorateShowtime = (showtime: Showtime, store: Store): ShowtimeWithMovie => ({
  ...showtime,
  movie: store.movies.find(item => item.id === showtime.movieId) ?? null
});

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
  const auditoriumType = input.auditoriumType === "vip" || auditorium.toLowerCase().includes("vip") ? "vip" : "regular";
  const id = Math.max(0, ...store.showtimes.map(item => item.id)) + 1;
  const nextId = id;
  const seats = (input.seats?.length ? input.seats : Array.from({ length: auditoriumType === "vip" ? 12 : 30 }, (_, i) => ({ row: String.fromCharCode(65 + Math.floor(i / (auditoriumType === "vip" ? 6 : 10))), number: i % (auditoriumType === "vip" ? 6 : 10) + 1, price: auditoriumType === "vip" ? 780 : 10 }))).map((seat, i) => ({
    id: nextId * 100 + i + 1, showtimeId: nextId, row: seat.row, number: seat.number, price: Number(seat.price) || 10, status: "Available" as const
  }));
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
