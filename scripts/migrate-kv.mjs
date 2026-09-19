import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// One-off migration: pushes the local data/cinema.json store into Vercel KV
// (Upstash Redis) under the "cinema:store" key so the deployed site shares a
// durable, in-memory-free database. Run once after configuring KV, then KV
// becomes the source of truth. Refuses to run with NODE_ENV=production.

const parseEnv = (file) => {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      })
  );
};

const DRY_RUN = process.argv.includes("--dry-run");

const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run with NODE_ENV=production. Run this locally with `npm run migrate:kv`.");
  process.exit(1);
}
if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN) {
  if (!DRY_RUN) {
    console.error("KV_REST_API_URL and KV_REST_API_TOKEN are required. Add them to a gitignored .env.local.");
    console.error("  Create a KV store: Vercel dashboard > Storage > Create > KV, or `vercel kv create`.");
    console.error("  Then copy the REST URL and token into .env.local (or run `vercel env pull`).");
    process.exit(1);
  }
  console.warn("KV credentials not found — running in dry-run mode (nothing will be written).");
}

const localFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "cinema.json");
if (!existsSync(localFile)) {
  console.error(`No local store found at ${localFile}. Nothing to migrate.`);
  process.exit(1);
}

const DEFAULT_ADD_ONS = [
  { id: "popcorn", name: "Classic popcorn", description: "Freshly popped, salted just right", price: 180, icon: "🍿" },
  { id: "soft-drink", name: "Soft drink", description: "Large soda, ice-cold", price: 90, icon: "🥤" },
  { id: "combo", name: "Movie night combo", description: "Popcorn + soft drink", price: 240, icon: "🍿🥤", comboOf: ["popcorn", "soft-drink"] },
  { id: "nachos", name: "Loaded nachos", description: "Cheesy, crunchy, shareable", price: 220, icon: "🧀" }
];

const DEFAULT_AUDITORIUMS = [
  { id: 1, name: "Auditorium 1", type: "regular" },
  { id: 2, name: "Auditorium 2", type: "regular" },
  { id: 3, name: "Auditorium 3", type: "regular" },
  { id: 4, name: "Auditorium 4", type: "regular" },
  { id: 5, name: "Auditorium 5", type: "regular" },
  { id: 6, name: "Auditorium 6", type: "regular" },
  { id: 7, name: "VIP Lounge", type: "vip" }
];

const buildTemplate = (id, name, type) => {
  const cols = type === "vip" ? 6 : 10;
  const rows = type === "vip" ? 2 : 3;
  const seats = [];
  for (let i = 0; i < rows * cols; i++) {
    seats.push({ id: id * 100 + i + 1, row: String.fromCharCode(65 + Math.floor(i / cols)), number: (i % cols) + 1, status: "Available", price: type === "vip" ? 780 : 520, variant: type === "vip" ? "recliner" : "standard" });
  }
  return { id, name, type, status: "Open", seats };
};

const seatFromTemplate = (template, showtimeId, price) =>
  template.seats.map((seat, i) => ({ id: showtimeId * 100 + i + 1, row: seat.row, number: seat.number, price, status: "Available", variant: seat.variant }));

const normalizeAuditoriums = (list) => {
  const source = Array.isArray(list) ? list : [];
  const result = [];
  for (const def of DEFAULT_AUDITORIUMS) {
    const found = source.find((item) => item && typeof item === "object" && Number(item.id) === def.id);
    if (found) {
      const existing = found;
      const needsSeats = !Array.isArray(existing.seats) || existing.seats.length === 0;
      const seats = needsSeats
        ? buildTemplate(def.id, def.name, def.type).seats
        : existing.seats.map((seat) => (seat.variant ? { ...seat } : { ...seat, variant: def.type === "vip" ? "recliner" : "standard" }));
      const validStatus = existing.status === "Open" || existing.status === "Maintenance" || existing.status === "Closed";
      result.push({ id: existing.id ?? def.id, name: def.name, type: def.type, status: validStatus ? existing.status : "Open", seats });
    } else {
      result.push(buildTemplate(def.id, def.name, def.type));
    }
  }
  return result;
};

const fieldsSet = (showtime) =>
  [showtime.endTime, showtime.auditoriumId, showtime.auditoriumType, showtime.experience, showtime.price]
    .filter((value) => value !== undefined)
    .length;

const dedupeShowtimes = (list) => {
  const byId = new Map();
  for (const showtime of list) {
    if (!byId.has(showtime.id) || fieldsSet(showtime) > fieldsSet(byId.get(showtime.id))) {
      byId.set(showtime.id, showtime);
    }
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
};

const showtimeEnd = (startIso, durationMinutes) =>
  new Date(new Date(startIso).getTime() + durationMinutes * 60000).toISOString();

const normalize = (raw) => {
  const store = {
    branches: Array.isArray(raw.branches) && raw.branches.length ? raw.branches : ["CinemaBooking"],
    movies: Array.isArray(raw.movies) ? raw.movies : [],
    showtimes: Array.isArray(raw.showtimes) ? raw.showtimes : [],
    bookings: Array.isArray(raw.bookings) ? raw.bookings : [],
    profiles: raw.profiles && typeof raw.profiles === "object" ? raw.profiles : {},
    watchlists: raw.watchlists && typeof raw.watchlists === "object" ? raw.watchlists : {},
    ratings: Array.isArray(raw.ratings) ? raw.ratings : [],
    addOns: Array.isArray(raw.addOns) && raw.addOns.length ? raw.addOns : structuredClone(DEFAULT_ADD_ONS),
    notifications: Array.isArray(raw.notifications) ? raw.notifications : []
  };

  const changedShowtimesBefore = store.showtimes.length;
  store.showtimes = dedupeShowtimes(store.showtimes);

  store.movies = store.movies.map((movie, index) => ({
    ...movie,
    status: movie.status ?? "now showing",
    description: movie.description ?? movie.synopsis ?? "",
    genre: movie.genre ?? movie.tags?.[0] ?? "Drama",
    cast: movie.cast ?? "",
    releaseDate: movie.releaseDate ?? null,
    experience: movie.experience ?? (index === 0 ? "IMAX" : "Director's Cut"),
    tags: movie.tags ?? (index === 0 ? ["Sci-fi", "Mind-bending"] : ["Comedy", "Classic"]),
    basePrice: movie.basePrice ?? (index === 0 ? 520 : 450)
  }));

  store.auditoriums = normalizeAuditoriums(Array.isArray(raw.auditoriums) ? raw.auditoriums : []);

  store.showtimes = store.showtimes.map((showtime, index) => {
    const renamed = showtime.auditorium === "Auditorium 7 — VIP" ? "VIP Lounge" : showtime.auditorium;
    const price = showtime.price ?? (showtime.movieId === 1 ? 520 : 450);
    const movie = store.movies.find((item) => item.id === showtime.movieId);
    const template = store.auditoriums.find((item) => item.name === renamed);
    return {
      ...showtime,
      auditorium: renamed,
      auditoriumType: showtime.auditoriumType ?? (renamed.toLowerCase().includes("vip") ? "vip" : "regular"),
      experience: showtime.experience ?? (showtime.movieId === 1 ? "IMAX" : "Director's Cut"),
      price,
      auditoriumId: showtime.auditoriumId ?? template?.id,
      endTime: showtime.endTime ?? (movie ? showtimeEnd(showtime.startTime, movie.durationMinutes) : showtime.startTime),
      seats: showtime.seats.map((seat) => ({ ...seat, price, variant: seat.variant ?? (renamed.toLowerCase().includes("vip") ? "recliner" : "standard") }))
    };
  });

  if (!store.showtimes.some((showtime) => showtime.auditoriumType === "vip")) {
    const id = Math.max(0, ...store.showtimes.map((showtime) => showtime.id)) + 1;
    const startTime = new Date(Math.max(...store.showtimes.map((showtime) => new Date(showtime.startTime).getTime())) + 90 * 60000).toISOString();
    const vip = store.auditoriums.find((auditorium) => auditorium.type === "vip");
    store.showtimes.push({
      id,
      movieId: store.movies[0]?.id,
      experience: "Premium",
      price: 780,
      startTime,
      endTime: showtimeEnd(startTime, store.movies[0]?.durationMinutes ?? 0),
      auditorium: vip?.name ?? "VIP Lounge",
      auditoriumId: vip?.id,
      auditoriumType: "vip",
      seats: vip ? seatFromTemplate(vip, id, 780) : []
    });
  }

  return { store, deduped: changedShowtimesBefore - store.showtimes.length };
};

const { Redis } = await import("@upstash/redis");

const raw = JSON.parse(readFileSync(localFile, "utf8"));
const { store, deduped } = normalize(raw);

if (!store.movies.length) {
  console.error("The local store has no movies. Refusing to overwrite KV with an empty database.");
  process.exit(1);
}

if (DRY_RUN) {
  console.log("Dry-run of store migration (nothing written):");
  console.log(`  Movies:       ${store.movies.length}`);
  console.log(`  Showtimes:    ${store.showtimes.length}${deduped > 0 ? " (would dedupe " + deduped + " duplicate(s))" : " (no duplicates)"}`);
  console.log(`  Showtime ids: ${store.showtimes.map((s) => s.id).join(", ")}`);
  console.log(`  Auditoriums:  ${store.auditoriums.length}`);
  console.log(`  Bookings:     ${store.bookings.length}`);
  console.log(`  Add-ons:      ${store.addOns.length}`);
  console.log("  Key:          cinema:store");
  process.exit(0);
}

const redis = new Redis({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN });
const before = await redis.get("cinema:store").catch(() => null);
await redis.set("cinema:store", store);

console.log("Migrated store to Vercel KV (key: cinema:store).");
console.log(`  Movies:       ${store.movies.length} (${before?.movies?.length ?? 0} before)`);
console.log(`  Showtimes:    ${store.showtimes.length} (${deduped > 0 ? `deduped ${deduped} duplicate(s)` : "no duplicates"})`);
console.log(`  Auditoriums:  ${store.auditoriums.length}`);
console.log(`  Bookings:     ${store.bookings.length}`);
console.log(`  Add-ons:      ${store.addOns.length}`);
console.log("Done. KV is now the durable source of truth. Redeploy the Vercel site with KV_REST_API_URL and KV_REST_API_TOKEN set.");