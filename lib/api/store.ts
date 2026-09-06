import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Auditorium, Movie, Seat, Showtime, Store } from "../types";

const DEFAULT_AUDITORIUMS: { id: number; name: string; type: "regular" | "vip" }[] = [
  { id: 1, name: "Auditorium 1", type: "regular" },
  { id: 2, name: "Auditorium 2", type: "regular" },
  { id: 3, name: "Auditorium 3", type: "regular" },
  { id: 4, name: "Auditorium 4", type: "regular" },
  { id: 5, name: "Auditorium 5", type: "regular" },
  { id: 6, name: "Auditorium 6", type: "regular" },
  { id: 7, name: "VIP Lounge", type: "vip" }
];

const buildTemplate = (id: number, name: string, type: "regular" | "vip"): Auditorium => {
  const cols = type === "vip" ? 6 : 10;
  const rows = type === "vip" ? 2 : 3;
  const seats: Seat[] = [];
  for (let i = 0; i < rows * cols; i++) {
    seats.push({ id: id * 100 + i + 1, row: String.fromCharCode(65 + Math.floor(i / cols)), number: (i % cols) + 1, status: "Available", price: type === "vip" ? 780 : 520, variant: type === "vip" ? "recliner" : "standard" });
  }
  return { id, name, type, status: "Open", seats };
};

const seatFromTemplate = (template: Auditorium, showtimeId: number, price: number): Seat[] =>
  template.seats.map((seat, i) => ({ id: showtimeId * 100 + i + 1, row: seat.row, number: seat.number, price, status: "Available", variant: seat.variant }));

const seed = (): Store => {
  const movies: Movie[] = [
    { id: 1, title: "Inception", synopsis: "A skilled extractor enters the dreams of others to steal secrets.", durationMinutes: 148, posterUrl: "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg", rating: "PG-13", experience: "IMAX", tags: ["Sci-fi", "Mind-bending"], basePrice: 520 },
    { id: 2, title: "The Grand Budapest Hotel", synopsis: "A legendary concierge and his lobby boy become embroiled in a family inheritance.", durationMinutes: 100, posterUrl: "https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg", rating: "R", experience: "Director's Cut", tags: ["Comedy", "Classic"], basePrice: 450 }
  ];
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const auditoriums = DEFAULT_AUDITORIUMS.map(def => buildTemplate(def.id, def.name, def.type));
  const byId = (id: number) => auditoriums.find(a => a.id === id)!;
  const showtimes: Showtime[] = [
    { id: 1, movieId: 1, experience: "IMAX", price: 520, startTime: new Date(tomorrow.getTime() + 18 * 3600000).toISOString(), auditorium: byId(1).name, auditoriumType: "regular", seats: seatFromTemplate(byId(1), 1, 520) },
    { id: 2, movieId: 2, experience: "Director's Cut", price: 450, startTime: new Date(tomorrow.getTime() + (20 * 60 + 30) * 60000).toISOString(), auditorium: byId(2).name, auditoriumType: "regular", seats: seatFromTemplate(byId(2), 2, 450) },
    { id: 3, movieId: 1, experience: "Premium", price: 780, startTime: new Date(tomorrow.getTime() + 21 * 3600000).toISOString(), auditorium: byId(7).name, auditoriumType: "vip", seats: seatFromTemplate(byId(7), 3, 780) }
  ];
  return { branches: ["CinemaBooking"], auditoriums, movies, showtimes, bookings: [] };
};

const localFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "cinema.json");
let memory: Store | undefined;
let redisPromise: Promise<{ set: (key: string, value: unknown) => Promise<unknown>; get: <T>(key: string) => Promise<T | null> } | null> | null | undefined;

function normalizeAuditoriums(list: unknown): { auditoriums: Auditorium[]; changed: boolean } {
  const source = Array.isArray(list) ? list : [];
  const result: Auditorium[] = [];
  const isLegacyString = (item: unknown): item is string => typeof item === "string";
  let changed = false;
  for (const def of DEFAULT_AUDITORIUMS) {
    const found = source.find(item =>
      isLegacyString(item)
        ? item === def.name || (def.type === "vip" && /vip/i.test(item)) || (def.type === "regular" && new RegExp(`auditorium ${def.id}\\b`, "i").test(item))
        : !!item && typeof item === "object" && (item as Auditorium).id === def.id
    );
    if (isLegacyString(found)) {
      result.push(buildTemplate(def.id, def.name, def.type));
      changed = true;
    } else if (found && typeof found === "object") {
      const existing = found as Auditorium;
      const needsSeats = !Array.isArray(existing.seats) || existing.seats.length === 0;
      const seats: Seat[] = needsSeats
        ? buildTemplate(def.id, def.name, def.type).seats
        : existing.seats.map(seat => seat.variant ? { ...seat } : { ...seat, variant: def.type === "vip" ? "recliner" : "standard" });
      if (!needsSeats && seats.some((seat, i) => seat.variant !== existing.seats[i].variant)) changed = true;
      const validStatus = existing.status === "Open" || existing.status === "Maintenance" || existing.status === "Closed";
      if (existing.name !== def.name || existing.type !== def.type || !validStatus) changed = true;
      result.push({ id: existing.id ?? def.id, name: def.name, type: def.type, status: validStatus ? existing.status : "Open", seats });
    } else {
      result.push(buildTemplate(def.id, def.name, def.type));
      changed = true;
    }
  }
  return { auditoriums: result, changed };
}

function getKv() {
  if (redisPromise !== undefined) return redisPromise;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return (redisPromise = Promise.resolve(null));
  redisPromise = import("@upstash/redis")
    .then(({ Redis }) =>
      new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
    )
    .catch(() => null);
  return redisPromise;
}

export async function readStore(): Promise<Store> {
  const remote = await getKv();
  if (remote) {
    const value = await remote.get<Store>("cinema:store");
    if (value) return value;
  }
  if (memory) return structuredClone(memory);
  try {
    memory = JSON.parse(await fs.readFile(localFile, "utf8")) as Store;
    if (!memory?.movies?.length) {
      memory = seed();
      await writeStore(memory);
    }
  } catch {
    memory = seed();
    await writeStore(memory);
  }
  let changed = false;
  const branches = ["CinemaBooking"];
  if (JSON.stringify(memory.branches) !== JSON.stringify(branches)) { memory.branches = branches; changed = true; }
  const normalized = normalizeAuditoriums(memory.auditoriums);
  memory.auditoriums = normalized.auditoriums;
  changed ||= normalized.changed;
  memory.movies = memory.movies.map((movie, index) => {
    const next: Movie = { ...movie, status: movie.status ?? "now showing", description: movie.description ?? movie.synopsis ?? "", genre: movie.genre ?? movie.tags?.[0] ?? "Drama", cast: movie.cast ?? "", releaseDate: movie.releaseDate ?? null, experience: movie.experience ?? (index === 0 ? "IMAX" : "Director's Cut"), tags: movie.tags ?? (index === 0 ? ["Sci-fi", "Mind-bending"] : ["Comedy", "Classic"]), basePrice: movie.basePrice ?? (index === 0 ? 520 : 450) };
    changed ||= next.experience !== movie.experience || next.basePrice !== movie.basePrice || next.status !== movie.status;
    return next;
  });
  memory.showtimes = memory.showtimes.map((showtime, index) => {
    const renamed = showtime.auditorium === "Auditorium 7 — VIP" ? "VIP Lounge" : showtime.auditorium;
    const price = showtime.price ?? (showtime.movieId === 1 ? 520 : 450);
    const next: Showtime = { ...showtime, auditorium: renamed, auditoriumType: showtime.auditoriumType ?? (renamed.toLowerCase().includes("vip") ? "vip" : "regular"), experience: showtime.experience ?? (showtime.movieId === 1 ? "IMAX" : "Director's Cut"), price, seats: showtime.seats.map(seat => ({ ...seat, price, variant: seat.variant ?? (renamed.toLowerCase().includes("vip") ? "recliner" : "standard") })) };
    changed ||= renamed !== showtime.auditorium || showtime.price !== price || !showtime.auditoriumType;
    return next;
  });
  if (!memory.showtimes.some(showtime => showtime.auditoriumType === "vip")) {
    const id = Math.max(0, ...memory.showtimes.map(showtime => showtime.id)) + 1;
    const startTime = new Date(Math.max(...memory.showtimes.map(showtime => new Date(showtime.startTime).getTime())) + 90 * 60000).toISOString();
    const vip = memory.auditoriums.find(auditorium => auditorium.type === "vip");
    memory.showtimes.push({
      id, movieId: memory.movies[0].id, experience: "Premium", price: 780, startTime,
      auditorium: vip?.name ?? "VIP Lounge", auditoriumType: "vip",
      seats: vip ? seatFromTemplate(vip, id, 780) : []
    });
    changed = true;
  }
  if (changed) await writeStore(memory);
  return structuredClone(memory);
}

export async function writeStore(store: Store): Promise<void> {
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
