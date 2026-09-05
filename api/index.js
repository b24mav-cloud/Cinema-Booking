import { randomUUID } from "node:crypto";
import { readStore, writeStore } from "./store.js";
import { clearSession, getSessionUser, isAuthConfigured, requireUser, setSession, signIn } from "./auth.js";

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
    if (resource === "auth" && parts[1] === "me" && req.method === "GET") {
      return json(res, 200, { configured: isAuthConfigured(), user: await getSessionUser(req, res) });
    }
    if (resource === "auth" && parts[1] === "signin" && req.method === "POST") {
      const input = await body(req);
      if (!input?.email?.trim() || !input?.password) return json(res, 400, "Email and password are required.");
      const result = await signIn(input.email.trim(), input.password);
      if (result.error || !result.data.session) return json(res, 401, result.error?.message ?? "Unable to sign in.");
      setSession(res, result.data.session);
      const signedInUser = result.data.user;
      return json(res, 200, { user: {
        id: signedInUser.id,
        email: signedInUser.email ?? "",
        role: signedInUser.app_metadata?.role === "admin" || signedInUser.user_metadata?.role === "admin" ? "admin" : "customer"
      }});
    }
    if (resource === "auth" && parts[1] === "signout" && req.method === "POST") {
      clearSession(res);
      return json(res, 204, {});
    }
    if (resource === "account" && req.method === "GET") {
      const auth = await requireUser(req, res, "customer");
      if (auth.error) return json(res, auth.status, auth.error);
      const bookings = store.bookings.filter(item => item.customerId === auth.user.id || (!item.customerId && item.userEmail === auth.user.email));
      return json(res, 200, bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(item => ({
        ...item,
        showtime: decorateShowtime(store.showtimes.find(showtime => showtime.id === item.showtimeId), store)
      })));
    }
    if (resource === "admin" && parts[1] === "dashboard" && req.method === "GET") {
      const auth = await requireUser(req, res, "admin");
      if (auth.error) return json(res, auth.status, auth.error);
      const today = new Date().toISOString().slice(0, 10);
      return json(res, 200, {
        moviesCurrentlyShowing: store.movies.filter(movie => movie.status !== "archived" && movie.status !== "coming soon").length,
        upcomingMovies: store.movies.filter(movie => movie.status === "coming soon").length,
        archivedMovies: store.movies.filter(movie => movie.status === "archived").length,
        todaysBookings: store.bookings.filter(booking => booking.createdAt?.slice(0, 10) === today).length
      });
    }
    if (resource === "admin" && parts[1] === "movies") {
      const auth = await requireUser(req, res, "admin");
      if (auth.error) return json(res, auth.status, auth.error);
      if (req.method === "GET") return json(res, 200, store.movies);
      const input = await body(req);
      if (req.method === "POST") {
        if (!input?.title?.trim()) return json(res, 400, "Movie title is required.");
        const movie = { id: Math.max(0, ...store.movies.map(item => item.id)) + 1, title: input.title.trim(), description: input.description ?? "", synopsis: input.description ?? "", genre: input.genre ?? "", cast: input.cast ?? "", durationMinutes: Number(input.durationMinutes ?? 0), posterUrl: input.posterUrl ?? "", status: input.status ?? "coming soon", releaseDate: input.releaseDate ?? null, tags: input.genre ? [input.genre] : [], basePrice: Number(input.basePrice ?? 450) };
        store.movies.push(movie);
        await writeStore(store);
        return json(res, 201, movie);
      }
      if (req.method === "PATCH" && parts[2]) {
        const movie = store.movies.find(item => item.id === Number(parts[2]));
        if (!movie) return json(res, 404, "Movie was not found.");
        Object.assign(movie, input ?? {});
        if (input?.status === "archived") movie.archivedAt = new Date().toISOString();
        await writeStore(store);
        return json(res, 200, movie);
      }
    }
    if (resource === "health" && req.method === "GET") return json(res, 200, { status: "healthy" });
    if (resource === "branches" && req.method === "GET") return json(res, 200, store.branches ?? [...new Set(store.showtimes.map(item => item.branch).filter(Boolean))]);
    if (resource === "movies" && req.method === "GET") {
      const visibleMovies = store.movies.filter(item => item.status !== "archived");
      const movies = id ? visibleMovies.filter(item => item.id === Number(id)) : visibleMovies;
      return movies.length ? json(res, 200, id ? decorateMovie(movies[0], store) : movies.map(item => decorateMovie(item, store))) : json(res, 404, {});
    }
    if (resource === "showtimes" && req.method === "GET") {
      const showtimes = id ? store.showtimes.filter(item => item.id === Number(id)) : store.showtimes;
      return showtimes.length ? json(res, 200, id ? decorateShowtime(showtimes[0], store) : showtimes.map(item => ({ ...decorateShowtime(item, store), seats: item.seats }))) : json(res, 404, {});
    }
    if (resource === "showtimes" && req.method === "POST" && !id) {
      const input = await body(req);
      if (!input || !Number.isInteger(input.movieId) || !store.movies.some(movie => movie.id === input.movieId)) return json(res, 400, "Movie does not exist.");
      const auditorium = input.auditorium ?? "";
      const auditoriumType = input.auditoriumType === "vip" || auditorium.toLowerCase().includes("vip") ? "vip" : "regular";
      const showtime = { id: Math.max(0, ...store.showtimes.map(item => item.id)) + 1, movieId: input.movieId, startTime: new Date(input.startTime).toISOString(), auditorium, auditoriumType, seats: (input.seats?.length ? input.seats : Array.from({ length: auditoriumType === "vip" ? 12 : 30 }, (_, i) => ({ row: String.fromCharCode(65 + Math.floor(i / (auditoriumType === "vip" ? 6 : 10))), number: i % (auditoriumType === "vip" ? 6 : 10) + 1, price: auditoriumType === "vip" ? 780 : 10 }))).map((seat, i) => ({ id: (Math.max(0, ...store.showtimes.map(item => item.id)) + 1) * 100 + i + 1, showtimeId: 0, row: seat.row, number: seat.number, price: Number(seat.price), status: "Available" })) };
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
      const catalog = { popcorn: { name: "Classic popcorn", price: 180 }, combo: { name: "Movie night combo", price: 320 }, nachos: { name: "Loaded nachos", price: 220 } };
      const addOns = [...new Set(input.addOns ?? [])].filter(item => catalog[item]).map(item => ({ id: item, ...catalog[item] }));
      const seatTotal = seats.reduce((total, seat) => total + Number(seat.price || 0), 0);
      const totalAmount = seatTotal + addOns.reduce((total, item) => total + item.price, 0);
      const customer = await getSessionUser(req, res);
      const booking = { id: randomUUID(), showtimeId: showtime.id, customerId: customer?.role === "customer" ? customer.id : null, userEmail: input.userEmail.trim(), movieTitle: store.movies.find(movie => movie.id === showtime.movieId)?.title ?? "Unknown movie", auditorium: showtime.auditorium, seatSnapshot: seats.map(seat => ({ row: seat.row, number: seat.number, price: seat.price })), addOns, paymentMethod: input.paymentMethod ?? "GCash", totalAmount, createdAt: new Date().toISOString(), isConfirmed: false };
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
