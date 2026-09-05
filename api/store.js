import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = () => {
  const movies = [
    { id: 1, title: "Inception", synopsis: "A skilled extractor enters the dreams of others to steal secrets.", durationMinutes: 148, posterUrl: "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg", rating: "PG-13", experience: "IMAX", tags: ["Sci-fi", "Mind-bending"], basePrice: 520 },
    { id: 2, title: "The Grand Budapest Hotel", synopsis: "A legendary concierge and his lobby boy become embroiled in a family inheritance.", durationMinutes: 100, posterUrl: "https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg", rating: "R", experience: "Director's Cut", tags: ["Comedy", "Classic"], basePrice: 450 }
  ];
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const makeSeats = (showtimeId) => Array.from({ length: 30 }, (_, i) => ({
    id: showtimeId * 100 + i + 1, showtimeId, row: String.fromCharCode(65 + Math.floor(i / 10)),
    number: (i % 10) + 1, price: 10, status: "Available"
  }));
  const makeVipSeats = (showtimeId) => Array.from({ length: 12 }, (_, i) => ({
    id: showtimeId * 100 + i + 1, showtimeId, row: String.fromCharCode(65 + Math.floor(i / 6)),
    number: (i % 6) + 1, price: 780, status: "Available"
  }));
  const showtimes = [
    { id: 1, experience: "IMAX", price: 520, startTime: new Date(tomorrow.getTime() + 18 * 3600000).toISOString(), auditorium: "Auditorium 1", auditoriumType: "regular", seats: makeSeats(1).map(s => ({ ...s, price: 520 })) },
    { id: 2, experience: "Director's Cut", price: 450, startTime: new Date(tomorrow.getTime() + (20 * 60 + 30) * 60000).toISOString(), auditorium: "Auditorium 2", auditoriumType: "regular", seats: makeSeats(2).map(s => ({ ...s, price: 450 })) },
    { id: 3, movieId: 1, experience: "Premium", price: 780, startTime: new Date(tomorrow.getTime() + 21 * 3600000).toISOString(), auditorium: "Auditorium 7 — VIP", auditoriumType: "vip", seats: makeVipSeats(3) }
  ];
  showtimes[0].movieId = 1;
  return { branches: ["CinemaBooking"], auditoriums: ["Auditorium 1", "Auditorium 2", "Auditorium 3", "Auditorium 4", "Auditorium 5", "Auditorium 6", "Auditorium 7 — VIP"], movies, showtimes, bookings: [] };
};

const localFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "cinema.json");
let memory;
let kv;

async function getKv() {
  if (kv !== undefined) return kv;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return (kv = null);
  try {
    const { Redis } = await import("@upstash/redis");
    kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
  } catch {
    kv = null;
  }
  return kv;
}

export async function readStore() {
  const remote = await getKv();
  if (remote) {
    const value = await remote.get("cinema:store");
    if (value) return value;
  }
  if (memory) return structuredClone(memory);
  try {
    memory = JSON.parse(await fs.readFile(localFile, "utf8"));
    if (!memory?.movies?.length) {
      memory = seed();
      await writeStore(memory);
    }
  } catch {
    memory = seed();
    await writeStore(memory);
  }
  // Keep older local stores deployable while adding the richer booking catalog.
  let changed = false;
  const branches = ["CinemaBooking"];
  const auditoriums = ["Auditorium 1", "Auditorium 2", "Auditorium 3", "Auditorium 4", "Auditorium 5", "Auditorium 6", "Auditorium 7 — VIP"];
  if (JSON.stringify(memory.branches) !== JSON.stringify(branches)) { memory.branches = branches; changed = true; }
  if (JSON.stringify(memory.auditoriums) !== JSON.stringify(auditoriums)) { memory.auditoriums = auditoriums; changed = true; }
  memory.movies = memory.movies.map((movie, index) => {
    const next = { ...movie, status: movie.status ?? "now showing", description: movie.description ?? movie.synopsis ?? "", genre: movie.genre ?? movie.tags?.[0] ?? "Drama", cast: movie.cast ?? "", releaseDate: movie.releaseDate ?? null, experience: movie.experience ?? (index === 0 ? "IMAX" : "Director's Cut"), tags: movie.tags ?? (index === 0 ? ["Sci-fi", "Mind-bending"] : ["Comedy", "Classic"]), basePrice: movie.basePrice ?? (index === 0 ? 520 : 450) };
    changed ||= next.experience !== movie.experience || next.basePrice !== movie.basePrice || next.status !== movie.status;
    return next;
  });
  memory.showtimes = memory.showtimes.map((showtime, index) => {
    const price = showtime.price ?? (showtime.movieId === 1 ? 520 : 450);
    const next = { ...showtime, branch: undefined, auditoriumType: showtime.auditoriumType ?? (showtime.auditorium?.toLowerCase().includes("vip") ? "vip" : "regular"), experience: showtime.experience ?? (showtime.movieId === 1 ? "IMAX" : "Director's Cut"), price, seats: showtime.seats.map(seat => ({ ...seat, price })) };
    changed ||= Boolean(showtime.branch) || showtime.price !== price || !showtime.auditoriumType;
    return next;
  });
  if (!memory.showtimes.some(showtime => showtime.auditoriumType === "vip")) {
    const id = Math.max(0, ...memory.showtimes.map(showtime => showtime.id)) + 1;
    const startTime = new Date(Math.max(...memory.showtimes.map(showtime => new Date(showtime.startTime).getTime())) + 90 * 60000).toISOString();
    memory.showtimes.push({
      id, movieId: memory.movies[0].id, experience: "Premium", price: 780, startTime,
      auditorium: "Auditorium 7 — VIP", auditoriumType: "vip",
      seats: Array.from({ length: 12 }, (_, i) => ({
        id: id * 100 + i + 1, showtimeId: id, row: String.fromCharCode(65 + Math.floor(i / 6)),
        number: i % 6 + 1, price: 780, status: "Available"
      }))
    });
    changed = true;
  }
  if (changed) await writeStore(memory);
  return structuredClone(memory);
}

export async function writeStore(store) {
  memory = structuredClone(store);
  const remote = await getKv();
  if (remote) {
    await remote.set("cinema:store", memory);
    return;
  }
  try {
    await fs.mkdir(path.dirname(localFile), { recursive: true });
    await fs.writeFile(localFile, JSON.stringify(memory, null, 2));
  } catch {
    // Vercel's filesystem is read-only; memory remains a useful fallback.
  }
}
