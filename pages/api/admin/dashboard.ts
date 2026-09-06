import type { NextApiRequest, NextApiResponse } from "next";
import { readStore } from "../../../lib/api/store";
import { requireUser } from "../../../lib/api/auth";
import { json, wrap } from "../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  if (req.method !== "GET") return json(res, 404, { error: "Not found" });
  const auth = await requireUser(req, res, "admin");
  if (auth.error) return json(res, auth.status, auth.error);
  const today = new Date().toISOString().slice(0, 10);
  const auditoriums = store.auditoriums.map(auditorium => ({
    id: auditorium.id,
    name: auditorium.name,
    type: auditorium.type,
    status: auditorium.status,
    seatCount: auditorium.seats.length
  }));
  return json(res, 200, {
    moviesCurrentlyShowing: store.movies.filter(movie => movie.status !== "archived" && movie.status !== "coming soon").length,
    upcomingMovies: store.movies.filter(movie => movie.status === "coming soon").length,
    archivedMovies: store.movies.filter(movie => movie.status === "archived").length,
    todaysBookings: store.bookings.filter(booking => booking.createdAt?.slice(0, 10) === today).length,
    auditoriumsOpen: auditoriums.filter(auditorium => auditorium.status === "Open").length,
    auditoriumsTotal: auditoriums.length,
    auditoriums
  });
});