import type { NextApiRequest, NextApiResponse } from "next";
import { mutateStore, readStore } from "../../../../lib/api/store";
import { requireUser } from "../../../../lib/api/auth";
import { HttpError, json, readBody, wrap } from "../../../../lib/api/respond";
import { bookingStatus, bookingTicketCode, seatLabels } from "../../../../lib/api/bookings";
import type { Booking, Store } from "../../../../lib/types";

export type ValidationState = "ok" | "cancelled" | "refunded" | "already-used" | "ended" | "not-found";

export type ValidationResult = {
  state: ValidationState;
  message: string;
  booking?: ReturnType<typeof summarise>;
};

/**
 * Door-staff check-in and the admin bookings list.
 *
 * A scan is matched against each booking's stored ticket code, falling back to
 * the derived code for records booked before codes were persisted. A raw
 * booking id or a confirmation fragment typed by hand also works.
 */
export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const auth = await requireUser(req, res, "admin");
  if (auth.error || !auth.user) throw new HttpError(auth.status ?? 401, auth.error ?? "Authentication required.");

  if (req.method === "GET") return listBookings(req, res);
  if (req.method !== "POST") throw new HttpError(404, "Not found");

  const input = await readBody<{ code?: string }>(req);
  const code = (input?.code ?? "").trim();
  if (!code) throw new HttpError(400, "Scan or enter a ticket code.");

  const result = await mutateStore(store => {
    const booking = findBooking(store, code);
    if (!booking) return { state: "not-found", message: "No ticket matches that code." } as ValidationResult;

    const status = bookingStatus(booking);
    if (status === "cancelled" || status === "refunded") {
      return {
        state: status,
        message: `This booking was ${status}. Please send the guest to the box office.`,
        booking: summarise(booking, store)
      } as ValidationResult;
    }
    if (booking.checkedInAt) {
      return {
        state: "already-used",
        message: `Already checked in at ${new Date(booking.checkedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`,
        booking: summarise(booking, store)
      } as ValidationResult;
    }

    const showtime = store.showtimes.find(item => item.id === booking.showtimeId);
    if (showtime && new Date(showtime.endTime ?? showtime.startTime).getTime() < Date.now()) {
      return { state: "ended", message: "This show has already finished.", booking: summarise(booking, store) } as ValidationResult;
    }

    booking.checkedInAt = new Date().toISOString();
    booking.isConfirmed = true;
    booking.status = "confirmed";
    return {
      state: "ok",
      message: `Checked in · ${booking.seatSnapshot.length} ${booking.seatSnapshot.length === 1 ? "guest" : "guests"} · ${booking.auditorium}`,
      booking: summarise(booking, store)
    } as ValidationResult;
  });

  json(res, result.state === "not-found" ? 404 : 200, result);
});

async function listBookings(req: NextApiRequest, res: NextApiResponse) {
  const { status: statusFilter = "", query = "", from = "", to = "" } = req.query as Record<string, string>;
  const store = await readStore();
  const term = query.trim().toLowerCase();
  const fromTime = from ? new Date(from).getTime() : null;
  const toTime = to ? new Date(`${to}T23:59:59`).getTime() : null;

  const rows = store.bookings
    .filter(booking => {
      const status = bookingStatus(booking);
      if (statusFilter && status !== statusFilter) return false;
      const created = new Date(booking.createdAt).getTime();
      if (fromTime !== null && created < fromTime) return false;
      if (toTime !== null && created > toTime) return false;
      if (!term) return true;
      return (
        booking.id.toLowerCase().includes(term) ||
        bookingTicketCode(booking).toLowerCase().includes(term) ||
        booking.userEmail.toLowerCase().includes(term) ||
        booking.movieTitle.toLowerCase().includes(term) ||
        booking.auditorium.toLowerCase().includes(term) ||
        seatLabels(booking.seatSnapshot).toLowerCase().includes(term)
      );
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100)
    .map(booking => {
      const row = summarise(booking, store);
      return { ...row, status: bookingStatus(booking), checkedInAt: booking.checkedInAt ?? null, ticketCode: bookingTicketCode(booking) };
    });

  const revenue = rows
    .filter(row => row.status === "confirmed")
    .reduce((total, row) => total + row.totalAmount, 0);

  json(res, 200, { bookings: rows, count: rows.length, revenue });
}

function summarise(booking: Booking, store: Store) {
  const showtime = store.showtimes.find(item => item.id === booking.showtimeId);
  return {
    id: booking.id,
    movieTitle: booking.movieTitle,
    auditorium: booking.auditorium,
    seats: seatLabels(booking.seatSnapshot),
    seatCount: booking.seatSnapshot.length,
    addOns: booking.addOns.map(item => item.name),
    totalAmount: booking.totalAmount,
    userEmail: booking.userEmail,
    paymentMethod: booking.paymentMethod,
    paymentReference: booking.paymentReference ?? "",
    createdAt: booking.createdAt,
    startTime: showtime?.startTime ?? null,
    endTime: showtime?.endTime ?? null
  };
}

/**
 * Resolves a scanned ticket code: the stored code first, then the derived one for
 * legacy records, then manual-entry fallbacks (full id, or the `#A1B2C3D4`
 * confirmation fragment).
 */
function findBooking(store: Store, code: string): Booking | undefined {
  const trimmed = code.trim();
  const normalised = trimmed.toUpperCase().replace(/\s+/g, "");

  const byId = store.bookings.find(booking => booking.id.toUpperCase() === trimmed.toUpperCase());
  if (byId) return byId;

  const fragment = normalised.replace(/^CB-/, "").split("-")[0];
  if (fragment.length >= 6) {
    const byFragment = store.bookings.find(booking => booking.id.replace(/-/g, "").toUpperCase().startsWith(fragment));
    if (byFragment) return byFragment;
  }

  const upper = normalised.toUpperCase();
  return store.bookings.find(booking => bookingTicketCode(booking).toUpperCase() === upper);
}