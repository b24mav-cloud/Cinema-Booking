import { randomUUID } from "node:crypto";
import { readStore, writeStore } from "./store.js";

const json = (res, status, body, headers = {}) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(body));
};
const body = async (req) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return null; }
};
const decorateMovie = (movie, store) => ({ ...movie, showtimes: store.showtimes.filter(item => item.movieId === movie.id) });
const decorateShowtime = (showtime, store) => ({
  ...showtime, movie: store.movies.find(item => item.id === showtime.movieId) ?? null
});

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const resource = parts[0]?.toLowerCase();
  const id = parts[1];
  try {
    const store = await readStore();
    if (resource === "health" && req.method === "GET") return json(res, 200, { status: "healthy" });
    if (resource === "movies" && req.method === "GET") {
      const movies = id ? store.movies.filter(item => item.id === Number(id)) : store.movies;
      return movies.length ? json(res, 200, id ? decorateMovie(movies[0], store) : movies.map(item => decorateMovie(item, store))) : json(res, 404, {});
    }
    if (resource === "showtimes" && req.method === "GET") {
      const showtimes = id ? store.showtimes.filter(item => item.id === Number(id)) : store.showtimes;
      return showtimes.length ? json(res, 200, id ? decorateShowtime(showtimes[0], store) : showtimes.map(item => ({ ...decorateShowtime(item, store), seats: item.seats }))) : json(res, 404, {});
    }
    if (resource === "showtimes" && req.method === "POST" && !id) {
      const input = await body(req);
      if (!input || !Number.isInteger(input.movieId) || !store.movies.some(movie => movie.id === input.movieId)) return json(res, 400, "Movie does not exist.");
      const showtime = { id: Math.max(0, ...store.showtimes.map(item => item.id)) + 1, movieId: input.movieId, startTime: new Date(input.startTime).toISOString(), auditorium: input.auditorium ?? "", seats: (input.seats?.length ? input.seats : Array.from({ length: 30 }, (_, i) => ({ row: String.fromCharCode(65 + Math.floor(i / 10)), number: i % 10 + 1, price: 10 }))).map((seat, i) => ({ id: (Math.max(0, ...store.showtimes.map(item => item.id)) + 1) * 100 + i + 1, showtimeId: 0, row: seat.row, number: seat.number, price: Number(seat.price), status: "Available" })) };
      showtime.seats.forEach(seat => { seat.showtimeId = showtime.id; });
      store.showtimes.push(showtime);
      await writeStore(store);
      return json(res, 201, decorateShowtime(showtime, store), { Location: `/api/showtimes/${showtime.id}` });
    }
    if (resource === "bookings" && req.method === "GET" && id) {
      const booking = store.bookings.find(item => item.id === id);
      return booking ? json(res, 200, { ...booking, showtime: decorateShowtime(store.showtimes.find(item => item.id === booking.showtimeId), store) }) : json(res, 404, {});
    }
    if (resource === "bookings" && req.method === "POST" && !id) {
      const input = await body(req);
      const seatIds = [...new Set(input?.seatIds ?? [])];
      if (!input?.userEmail?.trim()) return json(res, 400, "UserEmail is required.");
      if (!seatIds.length) return json(res, 400, "At least one seat is required.");
      const showtime = store.showtimes.find(item => item.id === Number(input.showtimeId));
      if (!showtime) return json(res, 404, `Showtime ${input.showtimeId} was not found.`);
      const seats = showtime.seats.filter(seat => seatIds.includes(seat.id));
      if (seats.length !== seatIds.length) return json(res, 400, "One or more seats do not belong to the selected showtime.");
      if (seats.some(seat => seat.status !== "Available")) return json(res, 409, "One or more selected seats are no longer available.");
      seats.forEach(seat => { seat.status = "Reserved"; });
      const booking = { id: randomUUID(), showtimeId: showtime.id, userEmail: input.userEmail.trim(), seatIds, totalAmount: seats.reduce((total, seat) => total + seat.price, 0), createdAt: new Date().toISOString(), isConfirmed: false };
      store.bookings.push(booking);
      await writeStore(store);
      return json(res, 201, booking, { Location: `/api/bookings/${booking.id}` });
    }
    if (resource === "bookings" && id && parts[2] === "confirm" && req.method === "POST") {
      const booking = store.bookings.find(item => item.id === id);
      if (!booking) return json(res, 404, {});
      booking.isConfirmed = true;
      await writeStore(store);
      return json(res, 200, booking);
    }
    return json(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "Unexpected server error" });
  }
}
