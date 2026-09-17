import type { NextApiRequest, NextApiResponse } from "next";
import { readStore } from "../../../../lib/api/store";
import { requireUser } from "../../../../lib/api/auth";
import { json, wrap } from "../../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  if (req.method !== "GET") return json(res, 404, { error: "Not found" });
  const auth = await requireUser(req, res, "admin");
  if (auth.error) return json(res, auth.status, auth.error);
  const id = Number(req.query.id);
  const showtime = store.showtimes.find(item => item.id === id);
  if (!showtime) return json(res, 404, { error: "Showtime not found." });
  const movie = store.movies.find(item => item.id === showtime.movieId) ?? null;
  return json(res, 200, {
    id: showtime.id,
    startTime: showtime.startTime,
    endTime: showtime.endTime,
    auditorium: showtime.auditorium,
    auditoriumId: showtime.auditoriumId,
    auditoriumType: showtime.auditoriumType,
    experience: showtime.experience,
    price: showtime.price,
    movieTitle: movie?.title ?? "Unknown",
    moviePosterUrl: movie?.posterUrl ?? "",
    seats: showtime.seats
  });
});
