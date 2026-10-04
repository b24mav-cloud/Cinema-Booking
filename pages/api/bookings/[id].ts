import type { NextApiRequest, NextApiResponse } from "next";
import { mutateStore, readStore, CANCELLATION_CUTOFF_MS } from "../../../lib/api/store";
import { decorateShowtime } from "../../../lib/api/cinema";
import { requireUser } from "../../../lib/api/auth";
import { HttpError, json, wrap } from "../../../lib/api/respond";
import { bookingIcs, bookingStatus, bookingTicketCode, releaseSeats, seatLabels } from "../../../lib/api/bookings";
import { canAccessBooking } from "../../../lib/api/guest-access";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const id = String(req.query.id);
  if (!id) throw new HttpError(400, "A booking id is required.");

  // Booking records expose the customer's email, seats and payment reference, so
  // every route below requires the owner, an admin, or the guest receipt cookie
  // handed out when this browser completed the booking.
  const auth = await requireUser(req, res);
  const guestAccess = auth.error ? canAccessBooking(req, id, null) : false;
  if ((!auth.user || auth.error) && !guestAccess) {
    throw new HttpError(auth.status ?? 401, auth.error ?? "Authentication required.");
  }

  if (req.method === "GET") {
    const store = await readStore();
    const booking = store.bookings.find(item => item.id === id);
    if (!booking) throw new HttpError(404, "Booking not found.");
    assertCanView(auth.user, booking.customerId, booking.userEmail, guestAccess);
    if (req.query.format === "ics") {
      const showtime = store.showtimes.find(item => item.id === booking.showtimeId);
      const calendar = bookingIcs({ ...booking, showtime: showtime ? decorateShowtime(showtime, store) : undefined });
      if (!calendar) throw new HttpError(404, "The showtime for this booking no longer exists.");
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="cinema-booking-${id.slice(0, 8)}.ics"`);
      res.end(calendar);
      return;
    }
    const showtime = store.showtimes.find(item => item.id === booking.showtimeId);
    json(res, 200, {
      ...booking,
      status: bookingStatus(booking),
      ticketCode: bookingTicketCode(booking),
      seats: seatLabels(booking.seatSnapshot),
      showtime: showtime ? decorateShowtime(showtime, store) : null
    });
    return;
  }

  if (req.method === "DELETE" || req.method === "PATCH") {
    const wantsRefund = req.method === "PATCH" && String(req.query.action ?? "") === "refund";
    const result = await mutateStore(store => {
      const booking = store.bookings.find(item => item.id === id);
      if (!booking) throw new HttpError(404, "Booking not found.");
      assertCanView(auth.user, booking.customerId, booking.userEmail, guestAccess);

      const isAdmin = auth.user?.role === "admin";
      const showtime = store.showtimes.find(item => item.id === booking.showtimeId);
      if (!isAdmin) {
        if (wantsRefund) throw new HttpError(403, "Only staff can mark a booking as refunded.");
        if (!showtime) throw new HttpError(404, "The showtime for this booking no longer exists.");
        if (new Date(showtime.startTime).getTime() - Date.now() <= CANCELLATION_CUTOFF_MS) {
          throw new HttpError(409, `Bookings can only be cancelled more than ${CANCELLATION_CUTOFF_MS / 3600000} hours before the show. Please contact the cinema for a refund.`);
        }
        if (bookingStatus(booking) !== "confirmed" && bookingStatus(booking) !== "pending") {
          throw new HttpError(409, "This booking has already been cancelled.");
        }
      }

      const status = wantsRefund ? "refunded" : "cancelled";
      booking.status = status;
      booking.isConfirmed = false;
      if (!wantsRefund) booking.cancelledAt = new Date().toISOString();
      booking.cancelledBy = isAdmin ? "admin" : "customer";
      // Put the seats back on sale so the next customer can take them.
      if (showtime) releaseSeats(showtime, booking.seatSnapshot);
      return { ...booking, status };
    });
    json(res, 200, result);
    return;
  }

  throw new HttpError(404, "Not found");
});

function assertCanView(
  user: { id: string; role: string; email: string } | undefined,
  customerId: string | null,
  userEmail: string,
  guestAccess: boolean
) {
  if (user?.role === "admin") return;
  if (user && customerId === user.id) return;
  if (user && !customerId && userEmail.toLowerCase() === user.email.toLowerCase()) return;
  if (guestAccess) return;
  throw new HttpError(403, "You are not authorized to view this booking.");
}