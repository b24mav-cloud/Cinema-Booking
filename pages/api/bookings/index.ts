import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "node:crypto";
import { CANCELLATION_CUTOFF_MS, MAX_SEATS_PER_BOOKING, mutateStore } from "../../../lib/api/store";
import { isAuditoriumOpen } from "../../../lib/api/cinema";
import { checkShowtimeSoldOut } from "../../../lib/api/notifications";
import { getSessionUser } from "../../../lib/api/auth";
import { checkRateLimit, clientIp } from "../../../lib/api/rate-limit";
import { HttpError, json, readBody, wrap } from "../../../lib/api/respond";
import { bookingTotal, newBookingId, resolveAddOns, ticketCode } from "../../../lib/api/bookings";
import { grantGuestAccess } from "../../../lib/api/guest-access";
import type { SeatSnapshot } from "../../../lib/types";

const BOOKING_LIMIT = 12;
const WINDOW_MS = 10 * 60 * 1000;

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") throw new HttpError(404, "Not found");

  const limit = checkRateLimit(`booking:${clientIp(req)}`, BOOKING_LIMIT, WINDOW_MS);
  if (!limit.ok) throw new HttpError(429, "Too many bookings from this connection. Please wait a few minutes.", { "Retry-After": String(limit.retryAfter) });

  const input = await readBody<{
    showtimeId?: number;
    seatIds?: number[];
    holdId?: string;
    ownerToken?: string;
    userEmail?: string;
    addOns?: string[];
    paymentMethod?: string;
  }>(req);

  const seatIds = [...new Set(input?.seatIds ?? [])];
  const holdId = input?.holdId?.trim() ?? "";
  const userEmail = input?.userEmail?.trim().toLowerCase() ?? "";
  if (!holdId) throw new HttpError(409, "Your seat selection expired. Please pick your seats again.", { "X-Reason": "hold-expired" });
  if (!userEmail) throw new HttpError(400, "We need an email address to send your tickets.");
  if (!/^\S+@\S+\.\S+$/.test(userEmail)) throw new HttpError(400, "That email address doesn't look right.");
  if (!seatIds.length) throw new HttpError(400, "Choose at least one seat.");
  if (seatIds.length > MAX_SEATS_PER_BOOKING) throw new HttpError(400, `You can book up to ${MAX_SEATS_PER_BOOKING} seats in one transaction.`);

  const customer = await getSessionUser(req, res);

  const booking = await mutateStore(store => {
    const showtime = store.showtimes.find(item => item.id === Number(input?.showtimeId));
    if (!showtime) throw new HttpError(404, "That showtime could not be found.");
    if (!isAuditoriumOpen(store, showtime.auditorium)) throw new HttpError(409, "This auditorium is temporarily unavailable.");
    if (new Date(showtime.startTime).getTime() <= Date.now()) throw new HttpError(409, "This show has already started. Please choose another time.");

    // The hold is what makes checkout safe: it proves the seats were claimed for
    // this session and were not taken while the customer was choosing add-ons.
    const hold = (store.seatHolds ?? []).find(item => item.id === holdId);
    if (!hold || hold.showtimeId !== showtime.id) {
      throw new HttpError(409, "Your seat selection expired. Please pick your seats again.", { "X-Reason": "hold-expired" });
    }
    if (hold.expiresAt && new Date(hold.expiresAt).getTime() <= Date.now()) {
      store.seatHolds = (store.seatHolds ?? []).filter(item => item.id !== holdId);
      throw new HttpError(409, "Your seat selection expired. Please pick your seats again.", { "X-Reason": "hold-expired" });
    }
    if (seatIds.some(id => !hold.seatIds.includes(id))) {
      throw new HttpError(409, "Your seat selection changed. Please pick your seats again.", { "X-Reason": "hold-mismatch" });
    }
    // A hold id alone is not enough: whoever presents it must be the session
    // that created it, so a leaked id cannot be spent by another customer.
    const owner = customer?.role === "customer" ? customer.id : (input?.ownerToken ?? "").trim();
    if (!owner || hold.owner !== owner) {
      throw new HttpError(403, "This seat hold belongs to another session. Please pick your seats again.");
    }

    const seatObjects = showtime.seats.filter(seat => seatIds.includes(seat.id));
    if (seatObjects.length !== seatIds.length) throw new HttpError(400, "One or more seats do not belong to the selected showtime.");
    if (seatObjects.some(seat => seat.status !== "Available")) {
      throw new HttpError(409, "One or more selected seats are no longer available.", { "X-Reason": "seat-taken" });
    }

    seatObjects.forEach(seat => { seat.status = "Reserved"; });
    store.seatHolds = (store.seatHolds ?? []).filter(item => item.id !== holdId);

    const seatSnapshot: SeatSnapshot[] = seatObjects.map(seat => ({ row: seat.row, number: seat.number, price: seat.price }));
    const addOns = resolveAddOns(store, input?.addOns ?? []);
    const movie = store.movies.find(item => item.id === showtime.movieId);
    const bookingIdForCode = newBookingId();
    const record = {
      id: bookingIdForCode,
      showtimeId: showtime.id,
      customerId: customer?.role === "customer" ? customer.id : null,
      userEmail,
      movieTitle: movie?.title ?? "Unknown movie",
      auditorium: showtime.auditorium,
      seatSnapshot,
      addOns,
      paymentMethod: input?.paymentMethod?.trim() || "GCash",
      totalAmount: bookingTotal(seatSnapshot, addOns),
      createdAt: new Date().toISOString(),
      isConfirmed: true,
      status: "confirmed" as const,
      checkedInAt: null,
      paymentReference: `PAY-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
      ticketCode: ticketCode(bookingIdForCode)
    };
    store.bookings.push(record);
    checkShowtimeSoldOut(store, showtime.id);
    return {
      ...record,
      showtime: { id: showtime.id, startTime: showtime.startTime, endTime: showtime.endTime, auditorium: showtime.auditorium, auditoriumType: showtime.auditoriumType }
    };
  });

  // Guests get a signed, HttpOnly receipt cookie so the confirmation screen can
  // show, export and cancel this booking without forcing a login. Must be set
  // before the response is flushed.
  grantGuestAccess(res, booking.id);
  json(res, 201, booking, { Location: `/api/bookings/${booking.id}` });
});