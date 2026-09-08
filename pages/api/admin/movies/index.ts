import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../../lib/api/store";
import { validateMovieInput, validateShowtimeDrafts } from "../../../../lib/api/cinema";
import { requireUser } from "../../../../lib/api/auth";
import { json, readBody, wrap } from "../../../../lib/api/respond";
import type { Movie } from "../../../../lib/types";

type ShowtimeInput = { id?: number; auditoriumId?: number; startTime?: string };
type MovieInput = { title?: string; genre?: string; durationMinutes?: number; status?: string; cast?: string; description?: string; posterUrl?: string; showtimes?: ShowtimeInput[] };

const trimShowtimes = (list: ShowtimeInput[] | undefined): ShowtimeInput[] =>
  (list ?? [])
    .map(item => ({
      id: Number.isInteger(item?.id) ? Number(item?.id) : undefined,
      auditoriumId: item?.auditoriumId === undefined || item?.auditoriumId === null ? undefined : Number(item?.auditoriumId),
      startTime: typeof item?.startTime === "string" && item.startTime ? item.startTime : undefined
    }))
    .filter(item => item.auditoriumId !== undefined || item.startTime !== undefined);

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const auth = await requireUser(req, res, "admin");
  if (auth.error) return json(res, auth.status, auth.error);
  if (req.method === "GET") {
    const movies = store.movies.map(movie => ({
      ...movie,
      showtimeCount: store.showtimes.filter(showtime => showtime.movieId === movie.id).length,
      showtimes: store.showtimes.filter(showtime => showtime.movieId === movie.id).map(showtime => ({ id: showtime.id, startTime: showtime.startTime, endTime: showtime.endTime, auditorium: showtime.auditorium, auditoriumId: showtime.auditoriumId }))
    }));
    return json(res, 200, movies);
  }
  if (req.method === "POST") {
    const input = (await readBody<MovieInput>(req)) ?? {};
    const result = validateMovieInput(input);
    if (Object.keys(result.errors).length) return json(res, 400, { error: "Please fix the highlighted fields.", errors: result.errors });
    const values = result.values!;
    const movie: Movie = {
      id: Math.max(0, ...store.movies.map(item => item.id)) + 1,
      title: values.title,
      description: values.description,
      synopsis: values.description,
      genre: values.genre,
      cast: values.cast,
      durationMinutes: values.durationMinutes,
      posterUrl: values.posterUrl,
      status: values.status,
      releaseDate: null,
      tags: [values.genre],
      basePrice: 450
    };
    const drafts = trimShowtimes(input.showtimes).map(item => ({ id: item.id, auditoriumId: item.auditoriumId, startTime: item.startTime }));
    const validation = validateShowtimeDrafts(store, movie, drafts);
    if (Object.keys(validation.errors).length) return json(res, 400, { error: "Please fix the highlighted fields.", errors: { ...result.errors, ...validation.errors } });
    store.movies.push(movie);
    store.showtimes.push(...(validation.showtimes ?? []));
    await writeStore(store);
    return json(res, 201, movie);
  }
  json(res, 404, { error: "Not found" });
});