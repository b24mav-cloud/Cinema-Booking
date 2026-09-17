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
  const todaysConfirmed = store.bookings.filter(booking => booking.isConfirmed && booking.createdAt?.slice(0, 10) === today);
  const ticketsSoldToday = todaysConfirmed.reduce((sum, booking) => sum + booking.seatSnapshot.length, 0);
  const revenueToday = todaysConfirmed.reduce((sum, booking) => sum + Number(booking.totalAmount ?? 0), 0);
  const todaysShowtimes = store.showtimes.filter(showtime => showtime.startTime?.slice(0, 10) === today);
  const occupancyRates = todaysShowtimes
    .filter(showtime => showtime.seats.length > 0)
    .map(showtime => showtime.seats.filter(seat => seat.status === "Reserved").length / showtime.seats.length);
  const avgOccupancyRate = occupancyRates.length
    ? Math.round((occupancyRates.reduce((sum, rate) => sum + rate, 0) / occupancyRates.length) * 100)
    : 0;
  return json(res, 200, {
    moviesCurrentlyShowing: store.movies.filter(movie => movie.status !== "archived" && movie.status !== "coming soon").length,
    upcomingMovies: store.movies.filter(movie => movie.status === "coming soon").length,
    archivedMovies: store.movies.filter(movie => movie.status === "archived").length,
    todaysBookings: store.bookings.filter(booking => booking.createdAt?.slice(0, 10) === today).length,
    auditoriumsOpen: auditoriums.filter(auditorium => auditorium.status === "Open").length,
    auditoriumsTotal: auditoriums.length,
    auditoriums,
    ticketsSoldToday,
    revenueToday,
    avgOccupancyRate
  });
});