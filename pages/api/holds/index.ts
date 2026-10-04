import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { MAX_SEATS_PER_BOOKING, SEAT_HOLD_MS, heldSeatIds, mutateStore, pruneSeatHolds } from "../../../lib/api/store";
import { isAuditoriumOpen } from "../../../lib/api/cinema";
import { getSessionUser } from "../../../lib/api/auth";
import { checkRateLimit, clientIp } from "../../../lib/api/rate-limit";
import { HttpError, json, readBody, wrap } from "../../../lib/api/respond";
import { seatLabels } from "../../../lib/api/bookings";
import type { SeatHold } from "../../../lib/types";

const HOLD_LIMIT = 60;
const WINDOW_MS = 10 * 60 * 1000;
const TOKEN_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * Claims seats for a short window so two people cannot complete checkout for
 * the same seat.
 *
 * `owner` identifies the claim holder: the Supabase user id when signed in,
 * otherwise a token the browser generates once and sends back on every call. The
 * token matters because guest checkout is the default path — without it each
 * re-pick would create a second anonymous hold and orphan the first.
 */
export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") throw new HttpError(404, "Not found");

  const limit = checkRateLimit(`hold:${clientIp(req)}`, HOLD_LIMIT, WINDOW_MS);
  if (!limit.ok) throw new HttpError(429, "Too many seat selection attempts. Please wait a moment.", { "Retry-After": String(limit.retryAfter) });

  const input = await readBody<{ showtimeId?: number; seatIds?: number[]; ownerToken?: string }>(req);
  const seatIds = [...new Set(input?.seatIds ?? [])];
  if (!seatIds.length) throw new HttpError(400, "Choose at least one seat.");
  if (seatIds.length > MAX_SEATS_PER_BOOKING) throw new HttpError(400, `You can select up to ${MAX_SEATS_PER_BOOKING} seats at a time.`);

  const user = await getSessionUser(req, res);
  const owner = resolveOwner(user?.id, input?.ownerToken);

  const result = await mutateStore(store => {
    const showtime = store.showtimes.find(item => item.id === Number(input?.showtimeId));
    if (!showtime) throw new HttpError(404, "That showtime could not be found.");
    if (!isAuditoriumOpen(store, showtime.auditorium)) throw new HttpError(409, "This auditorium is temporarily unavailable.");
    if (new Date(showtime.startTime).getTime() <= Date.now()) throw new HttpError(409, "This show has already started. Please choose another time.");

    const seats = showtime.seats.filter(seat => seatIds.includes(seat.id));
    if (seats.length !== seatIds.length) throw new HttpError(400, "One or more seats do not belong to the selected showtime.");
    if (seats.some(seat => seat.status !== "Available")) {
      throw new HttpError(409, "One or more selected seats are no longer available.", { "X-Reason": "seat-taken" });
    }

    // Another session may be mid-checkout on these seats.
    const blocked = heldSeatIds(store.seatHolds, showtime.id, owner);
    const clash = seats.filter(seat => blocked.has(seat.id));
    if (clash.length) {
      throw new HttpError(409, `Seat${clash.length > 1 ? "s" : ""} ${seatLabels(clash)} ${clash.length > 1 ? "are" : "is"} being booked by someone else right now.`, { "X-Reason": "held" });
    }

    store.seatHolds = pruneSeatHolds(store.seatHolds, store.showtimes);
    // One live hold per owner per showtime: re-picking seats replaces the claim.
    store.seatHolds = (store.seatHolds ?? []).filter(item => !(item.showtimeId === showtime.id && item.owner === owner));

    const hold: SeatHold = {
      id: randomUUID(),
      showtimeId: showtime.id,
      seatIds,
      owner,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SEAT_HOLD_MS).toISOString()
    };
    store.seatHolds.push(hold);
    return { hold, labels: seatLabels(seats) };
  });

  json(res, 201, {
    holdId: result.hold.id,
    expiresAt: result.hold.expiresAt,
    showtimeId: result.hold.showtimeId,
    seatIds: result.hold.seatIds,
    seats: result.labels
  });
});

/** Signed-in users are identified by id; everyone else by their browser token. */
function resolveOwner(userId: string | undefined, ownerToken: string | undefined): string {
  if (userId) return userId;
  const token = (ownerToken ?? "").trim();
  return TOKEN_PATTERN.test(token) ? token : randomUUID();
}