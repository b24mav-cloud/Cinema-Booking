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
  const showtimes = [
    { id: 1, movieId: 1, branch: "Riverside Nine", experience: "IMAX", price: 520, startTime: new Date(tomorrow.getTime() + 18 * 3600000).toISOString(), auditorium: "Auditorium 1", seats: makeSeats(1).map(s => ({ ...s, price: 520 })) },
    { id: 2, movieId: 2, branch: "Union Street", experience: "Director's Cut", price: 450, startTime: new Date(tomorrow.getTime() + (20 * 60 + 30) * 60000).toISOString(), auditorium: "Auditorium 2", seats: makeSeats(2).map(s => ({ ...s, price: 450 })) }
  ];
  return { branches: ["Riverside Nine", "Union Street"], movies, showtimes, bookings: [] };
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
  const branches = memory.branches ?? ["Riverside Nine", "Union Street"];
  if (!memory.branches) { memory.branches = branches; changed = true; }
  memory.movies = memory.movies.map((movie, index) => {
    const next = { ...movie, experience: movie.experience ?? (index === 0 ? "IMAX" : "Director's Cut"), tags: movie.tags ?? (index === 0 ? ["Sci-fi", "Mind-bending"] : ["Comedy", "Classic"]), basePrice: movie.basePrice ?? (index === 0 ? 520 : 450) };
    changed ||= next.experience !== movie.experience || next.basePrice !== movie.basePrice;
    return next;
  });
  memory.showtimes = memory.showtimes.map((showtime, index) => {
    const price = showtime.price ?? (showtime.movieId === 1 ? 520 : 450);
    const next = { ...showtime, branch: showtime.branch ?? branches[index % branches.length], experience: showtime.experience ?? (showtime.movieId === 1 ? "IMAX" : "Director's Cut"), price, seats: showtime.seats.map(seat => ({ ...seat, price })) };
    changed ||= !showtime.branch || showtime.price !== price;
    return next;
  });
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
