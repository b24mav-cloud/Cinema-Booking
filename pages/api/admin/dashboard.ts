import type { NextApiRequest, NextApiResponse } from "next";
import { readStore } from "../../../lib/api/store";
import { requireUser } from "../../../lib/api/auth";
import { bookingStatus, isActiveBooking } from "../../../lib/api/bookings";
import { HttpError, json, wrap } from "../../../lib/api/respond";
import type { Booking, Store } from "../../../lib/types";

type Bucket = { label: string; revenue: number; tickets: number; bookings: number };

const tally = (rows: Booking[], key: (booking: Booking) => string): Bucket[] => {
  const map = new Map<string, Bucket>();
  for (const booking of rows) {
    const label = key(booking);
    const bucket = map.get(label) ?? { label, revenue: 0, tickets: 0, bookings: 0 };
    bucket.revenue += Number(booking.totalAmount ?? 0);
    bucket.tickets += booking.seatSnapshot.length;
    bucket.bookings += 1;
    map.set(label, bucket);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
};

const inRange = (booking: Booking, from: number | null, to: number | null) => {
  const created = new Date(booking.createdAt).getTime();
  if (from !== null && created < from) return false;
  if (to !== null && created > to) return false;
  return true;
};

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") throw new HttpError(404, "Not found");
  const auth = await requireUser(req, res, "admin");
  if (auth.error) throw new HttpError(auth.status ?? 401, auth.error ?? "Authentication required.");

  const store = await readStore();
  const today = new Date().toISOString().slice(0, 10);
  const auditoriums = store.auditoriums.map(auditorium => ({
    id: auditorium.id,
    name: auditorium.name,
    type: auditorium.type,
    status: auditorium.status,
    seatCount: auditorium.seats.length
  }));

  const todaysConfirmed = store.bookings.filter(booking => isActiveBooking(booking) && booking.createdAt?.slice(0, 10) === today);
  const ticketsSoldToday = todaysConfirmed.reduce((sum, booking) => sum + booking.seatSnapshot.length, 0);
  const revenueToday = todaysConfirmed.reduce((sum, booking) => sum + Number(booking.totalAmount ?? 0), 0);
  const todaysShowtimes = store.showtimes.filter(showtime => showtime.startTime?.slice(0, 10) === today);
  const occupancyRates = todaysShowtimes
    .filter(showtime => showtime.seats.length > 0)
    .map(showtime => showtime.seats.filter(seat => seat.status === "Reserved").length / showtime.seats.length);
  const avgOccupancyRate = occupancyRates.length
    ? Math.round((occupancyRates.reduce((sum, rate) => sum + rate, 0) / occupancyRates.length) * 100)
    : 0;

  const summary = {
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
  };

  // No range supplied: keep the payload to the today summary only.
  const rawFrom = typeof req.query.from === "string" ? req.query.from : "";
  const rawTo = typeof req.query.to === "string" ? req.query.to : "";
  if (!rawFrom && !rawTo) return json(res, 200, summary);

  const from = rawFrom ? new Date(`${rawFrom}T00:00:00`).getTime() : null;
  const to = rawTo ? new Date(`${rawTo}T23:59:59`).getTime() : null;
  const scoped = store.bookings.filter(booking => inRange(booking, from, to));
  const paid = scoped.filter(booking => isActiveBooking(booking));

  return json(res, 200, {
    ...summary,
    range: {
      from: rawFrom || null,
      to: rawTo || null,
      bookings: scoped.length,
      tickets: paid.reduce((sum, booking) => sum + booking.seatSnapshot.length, 0),
      revenue: paid.reduce((sum, booking) => sum + Number(booking.totalAmount ?? 0), 0),
      cancelled: scoped.filter(booking => bookingStatus(booking) === "cancelled").length,
      refunded: scoped.filter(booking => bookingStatus(booking) === "refunded").length,
      avgOrderValue: paid.length
        ? Math.round(paid.reduce((sum, booking) => sum + Number(booking.totalAmount ?? 0), 0) / paid.length)
        : 0,
      checkedIn: scoped.filter(booking => booking.checkedInAt).length
    },
    byMovie: tally(paid, booking => booking.movieTitle).slice(0, 10),
    byAuditorium: tally(paid, booking => booking.auditorium),
    byPaymentMethod: tally(paid, booking => booking.paymentMethod || "Unknown"),
    byDay: dailyRevenue(store, paid),
    topSeats: topSeats(paid)
  });
});

/** Revenue per calendar day across the window, oldest first. */
function dailyRevenue(store: Store, bookings: Booking[]) {
  const map = new Map<string, Bucket>();
  for (const booking of bookings) {
    const day = booking.createdAt.slice(0, 10);
    const bucket = map.get(day) ?? { label: day, revenue: 0, tickets: 0, bookings: 0 };
    bucket.revenue += Number(booking.totalAmount ?? 0);
    bucket.tickets += booking.seatSnapshot.length;
    bucket.bookings += 1;
    map.set(day, bucket);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Which seats sell best — useful for deciding hall layout. */
function topSeats(bookings: Booking[]): { seat: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const booking of bookings) {
    for (const seat of booking.seatSnapshot) {
      const label = `${seat.row}${seat.number}`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([seat, count]) => ({ seat, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}