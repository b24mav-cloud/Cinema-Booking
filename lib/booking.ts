import type { AddOnSelection, Booking, BookingStatus, Seat, SeatHold, SeatSnapshot, Showtime, Store } from "./types";

/**
 * Booking logic that both the browser and the API need.
 *
 * Anything that touches `node:crypto` lives in `lib/api/bookings.ts` instead:
 * importing that module from a React component pulls a Node builtin into the
 * client bundle and the production build fails.
 */

export const TICKET_CODE_PREFIX = "CB";

export const seatLabel = (seat: Pick<SeatSnapshot, "row" | "number">): string => `${seat.row}${seat.number}`;

export const seatLabels = (seats: SeatSnapshot[]): string => seats.map(seatLabel).join(", ");

/** Sum of seat prices plus any add-ons, recomputed server-side. */
export function bookingTotal(seats: SeatSnapshot[], addOns: AddOnSelection[]): number {
  const seatSum = seats.reduce((total, seat) => total + Number(seat.price || 0), 0);
  const addOnSum = addOns.reduce((total, item) => total + Number(item.price || 0), 0);
  return seatSum + addOnSum;
}

export function resolveAddOns(store: Store, ids: string[]): AddOnSelection[] {
  const catalog = new Map((store.addOns ?? []).map(addOn => [addOn.id, addOn]));
  return [...new Set(ids)]
    .map(id => catalog.get(id))
    .filter((addOn): addOn is NonNullable<typeof addOn> => Boolean(addOn))
    .map(addOn => ({ id: addOn.id, name: addOn.name, price: addOn.price }));
}

/** Marks a showtime's seats as reserved and returns them. */
export const reserveSeats = (showtime: Showtime, seatIds: number[]): Seat[] => {
  const targets = showtime.seats.filter(seat => seatIds.includes(seat.id));
  for (const seat of targets) seat.status = "Reserved";
  return targets;
};

/**
 * Puts seats back on sale. Matches on row/number rather than seat id because a
 * seat-map edit re-derives ids from the auditorium template.
 */
export const releaseSeats = (showtime: Showtime, snapshot: SeatSnapshot[]): void => {
  const wanted = new Set(snapshot.map(seat => `${seat.row}:${seat.number}`));
  for (const seat of showtime.seats) {
    if (wanted.has(`${seat.row}:${seat.number}`)) seat.status = "Available";
  }
};

/** Seats already spoken for: confirmed bookings plus live holds by others. */
export function occupiedSeatIds(store: Store, showtimeId: number, owner: string): Set<number> {
  const ids = new Set<number>();
  const showtime = store.showtimes.find(item => item.id === showtimeId);
  if (!showtime) return ids;
  for (const booking of store.bookings) {
    if (booking.showtimeId !== showtimeId || !isActiveBooking(booking)) continue;
    for (const seat of booking.seatSnapshot) {
      const match = showtime.seats.find(item => item.row === seat.row && item.number === seat.number);
      if (match) ids.add(match.id);
    }
  }
  for (const hold of store.seatHolds ?? []) {
    if (hold.showtimeId !== showtimeId || hold.owner === owner) continue;
    for (const seatId of hold.seatIds) ids.add(seatId);
  }
  return ids;
}

export const holdsFor = (store: Store, showtimeId: number, owner: string): SeatHold[] =>
  (store.seatHolds ?? []).filter(hold => hold.showtimeId === showtimeId && hold.owner === owner);

export const bookingStatus = (booking: Booking): BookingStatus =>
  booking.status ?? (booking.isConfirmed ? "confirmed" : "pending");

export const isActiveBooking = (booking: Booking): boolean => {
  const status = bookingStatus(booking);
  return status === "confirmed" || status === "pending";
};

export const isCancellable = (booking: Booking, cutoffMs: number): boolean => {
  if (!isActiveBooking(booking)) return false;
  const showtime = booking.showtime;
  if (!showtime) return false;
  return new Date(showtime.startTime).getTime() - Date.now() > cutoffMs;
};

export const minutesUntil = (iso: string): number => Math.round((new Date(iso).getTime() - Date.now()) / 60000);

/**
 * Escapes a value for an iCalendar property and folds long lines per RFC 5545.
 */
const ics = (value: string): string => value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const icsStamp = (date: Date): string => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const icsUtc = (date: Date): string =>
  `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}${String(date.getUTCSeconds()).padStart(2, "0")}Z`;

/** Single-event .ics so a customer can add the show to their calendar. */
export function bookingIcs(booking: Booking): string {
  const showtime = booking.showtime;
  if (!showtime) return "";
  const start = new Date(showtime.startTime);
  const end = new Date(showtime.endTime ?? start.getTime() + 60000);
  const location = `${booking.auditorium} · CinemaBooking`;
  const description = `Seats ${seatLabels(booking.seatSnapshot)} · ${booking.seatSnapshot.length} ticket(s) · ${booking.paymentMethod}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CinemaBooking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.id}@cinemabooking`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${ics(`${booking.movieTitle} at CinemaBooking`)}`,
    `LOCATION:${ics(location)}`,
    `DESCRIPTION:${ics(description)}`,
    `URL:${ics(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/account`)}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}