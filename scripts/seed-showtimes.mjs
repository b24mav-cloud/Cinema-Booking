import fs from "node:fs";
import path from "node:path";

/**
 * Dev-only: slides the persisted schedule forward so there is always something
 * bookable.
 *
 * The built-in seed already creates showtimes relative to tomorrow
 * (lib/api/store.ts), but `data/cinema.json` persists once written. Left alone it
 * goes stale, and every showtime silently becomes unbookable: the seat map still
 * renders those seats as Available while `POST /api/holds` rejects the show with
 * "This show has already started", so the map looks broken rather than expired.
 *
 * Seat ids, statuses, bookings, movies and auditoriums are all preserved; only
 * the timings move. A timestamped backup is written before anything changes.
 *
 * Run: npm run seed:showtimes
 */

const DATA = path.join(process.cwd(), "data", "cinema.json");
const BACKUP_DIR = path.join(process.cwd(), "data", "backups");

/**
 * How far out the earliest show lands. This has to clear the cancellation cutoff
 * (CANCELLATION_CUTOFF_MS = 2h in lib/api/store.ts): a show starting in 90
 * minutes is bookable but not cancellable, so dev data seeded that way cannot
 * exercise the cancel-and-resell path at all. Four hours leaves margin.
 */
const CANCELLATION_CUTOFF_MS = 2 * 60 * 60 * 1000;
const LEAD_MS = CANCELLATION_CUTOFF_MS + 2 * 60 * 60 * 1000;

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run: this rewrites the schedule and is for local development only.");
  process.exit(1);
}

if (!fs.existsSync(DATA)) {
  console.error(`No store found at ${DATA}. Nothing to do.`);
  process.exit(1);
}

const raw = fs.readFileSync(DATA, "utf8");
let store;
try {
  store = JSON.parse(raw);
} catch (error) {
  console.error(`data/cinema.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

const showtimes = Array.isArray(store.showtimes) ? store.showtimes : [];
if (!showtimes.length) {
  console.error("Store has no showtimes; run the app once to create the default seed.");
  process.exit(1);
}

const starts = showtimes
  .map(item => new Date(item.startTime).getTime())
  .filter(value => Number.isFinite(value));

if (!starts.length) {
  console.error("No showtime has a parsable startTime; refusing to guess.");
  process.exit(1);
}

// Shift the whole schedule by one delta so the relative spacing (and any
// overnight gaps between shows) is preserved exactly.
const earliest = Math.min(...starts);
const delta = Date.now() + LEAD_MS - earliest;

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join(BACKUP_DIR, `cinema-${stamp}.json`);
fs.writeFileSync(backup, raw);
console.log(`Backup written: ${path.relative(process.cwd(), backup)}`);

for (const showtime of showtimes) {
  const oldStart = new Date(showtime.startTime).getTime();
  if (!Number.isFinite(oldStart)) continue;

  // Preserve the original runtime rather than re-deriving it from movie duration,
  // so edited durations survive the shift.
  const duration = Number.isFinite(new Date(showtime.endTime).getTime())
    ? new Date(showtime.endTime).getTime() - oldStart
    : 0;

  showtime.startTime = new Date(oldStart + delta).toISOString();
  if (duration > 0) showtime.endTime = new Date(oldStart + delta + duration).toISOString();
}

// Holds reference the old timings; drop them so nothing points at a stale window.
const droppedHolds = Array.isArray(store.seatHolds) ? store.seatHolds.length : 0;
store.seatHolds = [];

fs.writeFileSync(DATA, `${JSON.stringify(store, null, 2)}\n`);

// Re-read from disk rather than trusting the in-memory copy, so a bad write is
// caught here instead of surfacing later as an uncancellable booking.
const verify = JSON.parse(fs.readFileSync(DATA, "utf8"));
const soonest = Math.min(...verify.showtimes.map(item => new Date(item.startTime).getTime()));
if (soonest - Date.now() <= CANCELLATION_CUTOFF_MS) {
  console.error(
    `\nFAILED SELF-CHECK: earliest show starts in ${Math.round((soonest - Date.now()) / 60000)} minutes, ` +
    `inside the ${CANCELLATION_CUTOFF_MS / 60000}-minute cancellation cutoff. Dev data would be uncancellable.`
  );
  process.exit(1);
}

console.log(`\nMoved ${showtimes.length} showtime(s) forward by ${Math.round(delta / 3600000)}h; cleared ${droppedHolds} hold(s).`);
for (const showtime of [...showtimes].sort((a, b) => new Date(a.startTime) - new Date(b.startTime))) {
  const when = new Date(showtime.startTime);
  const minutes = showtime.seats?.filter(seat => seat.status === "Available").length ?? 0;
  console.log(
    `  id=${showtime.id}  ${when.toISOString()}  (${when.toLocaleString()})  ` +
    `${showtime.auditorium}  free=${minutes}/${showtime.seats?.length ?? 0}`
  );
}