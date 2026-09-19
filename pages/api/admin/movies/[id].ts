import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../../lib/api/store";
import { showtimeEnd, validateMovieInput, validateShowtimeDrafts, validateShowtimes } from "../../../../lib/api/cinema";
import { requireUser } from "../../../../lib/api/auth";
import { notifyMovieNowShowing } from "../../../../lib/api/notifications";
import { json, readBody, wrap } from "../../../../lib/api/respond";
import type { Movie } from "../../../../lib/types";

type ShowtimeInput = { id?: number; auditoriumId?: number; startTime?: string; price?: number };
type MovieInput = { title?: string; genre?: string; durationMinutes?: number; status?: string; cast?: string; description?: string; posterUrl?: string; trailerUrl?: string; showtimes?: ShowtimeInput[] };

const trimShowtimes = (list: ShowtimeInput[] | undefined): { id?: number; auditoriumId?: number; startTime?: string; price?: number }[] =>
  (list ?? [])
    .map(item => ({
      id: Number.isInteger(item?.id) ? Number(item?.id) : undefined,
      auditoriumId: item?.auditoriumId === undefined || item?.auditoriumId === null ? undefined : Number(item?.auditoriumId),
      startTime: typeof item?.startTime === "string" && item.startTime ? item.startTime : undefined,
      price: Number.isFinite(Number(item?.price)) && Number(item?.price) > 0 ? Number(item?.price) : undefined
    }))
    .filter(item => item.auditoriumId !== undefined || item.startTime !== undefined);

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const auth = await requireUser(req, res, "admin");
  if (auth.error) return json(res, auth.status, auth.error);
  if (req.method !== "PATCH") return json(res, 404, { error: "Not found" });
  const id = Number(req.query.id);
  const movie = store.movies.find(item => item.id === id);
  if (!movie) return json(res, 404, "Movie was not found.");
  const previousStatus = movie.status;
  const input = (await readBody<MovieInput>(req)) ?? {};
  if ("status" in input && Object.values(input).every(value => value === undefined || value === "")) {
    if (!["now showing", "coming soon", "archived"].includes(String(input.status))) return json(res, 400, "Choose a valid status.");
    movie.status = input.status as string;
    if (movie.status === "archived") movie.archivedAt = new Date().toISOString();
    if (movie.status === "now showing" && previousStatus !== "now showing") notifyMovieNowShowing(store, movie.id);
    await writeStore(store);
    return json(res, 200, movie);
  }
  const merged: MovieInput = {
    title: input.title ?? movie.title,
    genre: input.genre ?? movie.genre ?? "",
    durationMinutes: input.durationMinutes ?? movie.durationMinutes,
    status: input.status ?? movie.status ?? "coming soon",
    cast: input.cast ?? movie.cast,
    description: input.description ?? movie.description,
    posterUrl: input.posterUrl ?? movie.posterUrl,
    trailerUrl: input.trailerUrl ?? movie.trailerUrl
  };
  const result = validateMovieInput(merged);
  if (Object.keys(result.errors).length) return json(res, 400, { error: "Please fix the highlighted fields.", errors: result.errors });
  const values = result.values!;
  const candidateMovie: Movie = { ...movie, ...values };
  const runtimeChanged = values.durationMinutes !== movie.durationMinutes;
  const hadShowtimes = store.showtimes.some(showtime => showtime.movieId === movie.id);

  if (input.showtimes !== undefined) {
    const drafts = trimShowtimes(input.showtimes).map(item => ({ id: item.id, auditoriumId: item.auditoriumId, startTime: item.startTime, price: item.price }));
    const validation = validateShowtimeDrafts(store, candidateMovie, drafts);
    if (Object.keys(validation.errors).length) return json(res, 400, { error: "Please fix the highlighted fields.", errors: { ...result.errors, ...validation.errors } });
    const candidates = validation.showtimes!;
    const activeIds = new Set(candidates.map(showtime => showtime.id));
    store.showtimes = store.showtimes.filter(showtime => showtime.movieId !== movie.id || activeIds.has(showtime.id));
    store.showtimes.push(...candidates);
  } else if (runtimeChanged && hadShowtimes) {
    const rebuilt = store.showtimes.filter(showtime => showtime.movieId === movie.id).map(showtime => ({ ...showtime, endTime: showtimeEnd(showtime.startTime, values.durationMinutes) }));
    const conflicts = validateShowtimes(store, candidateMovie, rebuilt);
    if (Object.keys(conflicts).length) return json(res, 400, { error: "The new runtime creates a scheduling conflict.", errors: conflicts });
    store.showtimes = store.showtimes.map(showtime => showtime.movieId === movie.id ? { ...showtime, endTime: showtimeEnd(showtime.startTime, values.durationMinutes) } : showtime);
  }

  Object.assign(movie, values);
  movie.archivedAt = movie.status === "archived" ? new Date().toISOString() : undefined;
  if (movie.status === "now showing" && previousStatus !== "now showing") notifyMovieNowShowing(store, movie.id);
  await writeStore(store);
  return json(res, 200, movie);
});