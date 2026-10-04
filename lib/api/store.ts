import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddOn, Auditorium, Movie, Seat, SeatHold, Showtime, Store } from "../types";
import { showtimeEnd } from "./cinema";
import { withStoreLock } from "./mutex";

const DEFAULT_ADD_ONS: AddOn[] = [
  { id: "popcorn", name: "Classic popcorn", description: "Freshly popped, salted just right", price: 180, icon: "🍿" },
  { id: "soft-drink", name: "Soft drink", description: "Large soda, ice-cold", price: 90, icon: "🥤" },
  { id: "combo", name: "Movie night combo", description: "Popcorn + soft drink", price: 240, icon: "🍿🥤", comboOf: ["popcorn", "soft-drink"] },
  { id: "nachos", name: "Loaded nachos", description: "Cheesy, crunchy, shareable", price: 220, icon: "🧀" }
];

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
    { id: 1, title: "Inception", synopsis: "A skilled extractor enters the dreams of others to steal secrets.", durationMinutes: 148, posterUrl: "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg", rating: "PG-13", experience: "IMAX", tags: ["Sci-fi", "Mind-bending"], basePrice: 520, trailerUrl: "https://www.youtube.com/watch?v=YoHD9XEInc0" },
    { id: 2, title: "The Grand Budapest Hotel", synopsis: "A legendary concierge and his lobby boy become embroiled in a family inheritance.", durationMinutes: 100, posterUrl: "https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg", rating: "R", experience: "Director's Cut", tags: ["Comedy", "Classic"], basePrice: 450, trailerUrl: "https://www.youtube.com/watch?v=1Fg5iWmQjwk" }
  ];
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const auditoriums = DEFAULT_AUDITORIUMS.map(def => buildTemplate(def.id, def.name, def.type));
  const byId = (id: number) => auditoriums.find(a => a.id === id)!;
  const showtimes: Showtime[] = [
    { id: 1, movieId: 1, experience: "IMAX", price: 520, startTime: new Date(tomorrow.getTime() + 18 * 3600000).toISOString(), endTime: showtimeEnd(new Date(tomorrow.getTime() + 18 * 3600000).toISOString(), movies[0].durationMinutes), auditorium: byId(1).name, auditoriumId: 1, auditoriumType: "regular", seats: seatFromTemplate(byId(1), 1, 520) },
    { id: 2, movieId: 2, experience: "Director's Cut", price: 450, startTime: new Date(tomorrow.getTime() + (20 * 60 + 30) * 60000).toISOString(), endTime: showtimeEnd(new Date(tomorrow.getTime() + (20 * 60 + 30) * 60000).toISOString(), movies[1].durationMinutes), auditorium: byId(2).name, auditoriumId: 2, auditoriumType: "regular", seats: seatFromTemplate(byId(2), 2, 450) },
    { id: 3, movieId: 1, experience: "Premium", price: 780, startTime: new Date(tomorrow.getTime() + 21 * 3600000).toISOString(), endTime: showtimeEnd(new Date(tomorrow.getTime() + 21 * 3600000).toISOString(), movies[0].durationMinutes), auditorium: byId(7).name, auditoriumId: 7, auditoriumType: "vip", seats: seatFromTemplate(byId(7), 3, 780) }
  ];
  return { branches: ["CinemaBooking"], auditoriums, movies, showtimes, bookings: [], seatHolds: [], profiles: {}, watchlists: {}, ratings: [], addOns: DEFAULT_ADD_ONS, notifications: [] };
};

const localFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "cinema.json");
let memory: Store | undefined;

export type KvClient = {
  set: (key: string, value: unknown, options?: { nx?: boolean; px?: number }) => Promise<unknown>;
  get: <T>(key: string) => Promise<T | null>;
  del: (key: string) => Promise<unknown>;
};

let redisPromise: Promise<KvClient | null> | undefined;

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

const showtimeCompleteness = (showtime: Showtime): number =>
  [showtime.endTime, showtime.auditoriumId, showtime.auditoriumType, showtime.experience, showtime.price]
    .filter(value => value !== undefined)
    .length;

function dedupeShowtimes(list: Showtime[]): Showtime[] {
  const byId = new Map<number, Showtime>();
  for (const showtime of list) {
    const existing = byId.get(showtime.id);
    if (!existing || showtimeCompleteness(showtime) > showtimeCompleteness(existing)) byId.set(showtime.id, showtime);
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

function ensureCollections(store: Store): boolean {
  let changed = false;
  if (!store.profiles || typeof store.profiles !== "object") { store.profiles = {}; changed = true; }
  if (!store.watchlists || typeof store.watchlists !== "object") { store.watchlists = {}; changed = true; }
  if (!Array.isArray(store.ratings)) { store.ratings = []; changed = true; }
  if (!Array.isArray(store.addOns) || store.addOns.length === 0) { store.addOns = structuredClone(DEFAULT_ADD_ONS); changed = true; }
  if (!Array.isArray(store.notifications)) { store.notifications = []; changed = true; }
  if (!Array.isArray(store.seatHolds)) { store.seatHolds = []; changed = true; }
  return changed;
}

function getKv(): Promise<KvClient | null> {
  if (redisPromise !== undefined) return redisPromise;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return (redisPromise = Promise.resolve<KvClient | null>(null));
  redisPromise = import("@upstash/redis")
    .then(({ Redis }) =>
      new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! }) as unknown as KvClient
    )
    .catch(() => null);
  return redisPromise;
}

export async function readStore(): Promise<Store> {
  const remote = await getKv();
  if (remote) {
    const value = await remote.get<Store>("cinema:store");
    if (value) {
      ensureCollections(value);
      value.showtimes = dedupeShowtimes(value.showtimes);
      value.seatHolds = pruneSeatHolds(value.seatHolds ?? [], value.showtimes);
      return structuredClone(value);
    }
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
  const live = memory;
  const branches = ["CinemaBooking"];
  if (JSON.stringify(memory.branches) !== JSON.stringify(branches)) { memory.branches = branches; changed = true; }
  const showtimesBefore = memory.showtimes.length;
  memory.showtimes = dedupeShowtimes(memory.showtimes);
  changed ||= memory.showtimes.length !== showtimesBefore;
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
    const movie = live.movies.find(item => item.id === showtime.movieId);
    const template = live.auditoriums.find(item => item.name === renamed);
    const idBackfill = showtime.auditoriumId ?? template?.id;
    const endBackfill = showtime.endTime ?? (movie ? showtimeEnd(showtime.startTime, movie.durationMinutes) : showtime.startTime);
    next.auditoriumId = idBackfill;
    next.endTime = endBackfill;
    changed ||= renamed !== showtime.auditorium || showtime.price !== price || !showtime.auditoriumType || idBackfill !== showtime.auditoriumId || endBackfill !== showtime.endTime;
    return next;
  });
  if (!memory.showtimes.some(showtime => showtime.auditoriumType === "vip")) {
    const id = Math.max(0, ...memory.showtimes.map(showtime => showtime.id)) + 1;
    const startTime = new Date(Math.max(...memory.showtimes.map(showtime => new Date(showtime.startTime).getTime())) + 90 * 60000).toISOString();
    const vip = live.auditoriums.find(auditorium => auditorium.type === "vip");
    memory.showtimes.push({
      id, movieId: live.movies[0].id, experience: "Premium", price: 780, startTime,
      endTime: showtimeEnd(startTime, live.movies[0].durationMinutes),
      auditorium: vip?.name ?? "VIP Lounge", auditoriumId: vip?.id, auditoriumType: "vip",
      seats: vip ? seatFromTemplate(vip, id, 780) : []
    });
    changed = true;
  }
  changed ||= ensureCollections(memory);
  memory.seatHolds = pruneSeatHolds(memory.seatHolds, memory.showtimes);
  if (changed) await writeStore(memory);
  return structuredClone(memory);
}

/** How long a seat claim survives while the customer completes checkout. */
export const SEAT_HOLD_MS = 8 * 60 * 1000;

/** Cinema rule: one transaction cannot exceed this many seats. */
export const MAX_SEATS_PER_BOOKING = 8;

/** Customers can cancel free of charge up to this long before the show. */
export const CANCELLATION_CUTOFF_MS = 2 * 60 * 60 * 1000;

/**
 * Drops holds that have expired or belong to a showtime that already started.
 * Called on every read and before every mutation.
 */
export function pruneSeatHolds(holds: SeatHold[] | undefined, showtimes: Showtime[]): SeatHold[] {
  if (!holds?.length) return [];
  const now = Date.now();
  return holds.filter(hold => {
    if (new Date(hold.expiresAt).getTime() <= now) return false;
    const showtime = showtimes.find(item => item.id === hold.showtimeId);
    if (!showtime) return false;
    return new Date(showtime.startTime).getTime() > now;
  });
}

/** Seats currently claimed by someone else's live hold. */
export const heldSeatIds = (holds: SeatHold[] | undefined, showtimeId: number, owner: string): Set<number> => {
  const ids = new Set<number>();
  for (const hold of holds ?? []) {
    if (hold.showtimeId !== showtimeId || hold.owner === owner) continue;
    for (const seatId of hold.seatIds) ids.add(seatId);
  }
  return ids;
};

export async function writeStore(store: Store): Promise<void> {
  memory = structuredClone(store);
  const remote = await getKv();
  if (remote) {
    await remote.set("cinema:store", memory);
    return;
  }
  const tmpFile = `${localFile}.tmp`;
  try {
    await fs.mkdir(path.dirname(localFile), { recursive: true });
    await fs.writeFile(tmpFile, JSON.stringify(memory, null, 2));
    await fs.rename(tmpFile, localFile);
  } catch (error) {
    // Do not fake success: log loudly so a failed save is visible instead of
    // silently losing data. Memory still serves the current process.
    console.error("[cinema-store] Failed to persist data/cinema.json (changes are memory-only until restart):", error);
    try { await fs.rm(tmpFile, { force: true }); } catch { /* best effort */ }
  }
}

/**
 * The only safe way to change the store. Holds the cross-request lock and
 * re-reads inside it, so a read-modify-write can never be based on a snapshot
 * another writer already replaced.
 *
 * Throw `HttpError` from `mutator` to abort; the store is left untouched.
 */
export async function mutateStore<T>(mutator: (store: Store) => T | Promise<T>): Promise<T> {
  const kv = await getKv();
  return withStoreLock(kv, async () => {
    const store = await readStore();
    ensureCollections(store);
    store.seatHolds = pruneSeatHolds(store.seatHolds, store.showtimes);
    const result = await mutator(store);
    await writeStore(store);
    return result;
  });
}
