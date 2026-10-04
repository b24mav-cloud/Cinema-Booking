import type { NextApiRequest, NextApiResponse } from "next";
import { mutateStore } from "../../../../lib/api/store";
import { requireUser } from "../../../../lib/api/auth";
import { HttpError, json, wrap } from "../../../../lib/api/respond";
import { bookingStatus, ticketCode } from "../../../../lib/api/bookings";

/**
 * Bookings are confirmed server-side when they are created, so this route only
 * exists to confirm an older pending record. It requires the owner or an admin:
 * previously anyone holding a booking UUID could flip it to confirmed.
 */
export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") throw new HttpError(404, "Not found");
  const id = String(req.query.id);
  if (!id) throw new HttpError(400, "A booking id is required.");

  const auth = await requireUser(req, res);
  if (auth.error || !auth.user) throw new HttpError(auth.status ?? 401, auth.error ?? "Authentication required.");

  const booking = await mutateStore(store => {
    const record = store.bookings.find(item => item.id === id);
    if (!record) throw new HttpError(404, "Booking not found.");
    const owns = record.customerId === auth.user.id || (!record.customerId && record.userEmail.toLowerCase() === auth.user.email.toLowerCase());
    if (!owns && auth.user.role !== "admin") throw new HttpError(403, "You are not authorized to modify this booking.");
    const status = bookingStatus(record);
    if (status === "cancelled" || status === "refunded") {
      throw new HttpError(409, `This booking was ${status} and can no longer be confirmed.`);
    }
    if (status === "confirmed") return { ...record, status, ticketCode: ticketCode(record.id) };
    record.isConfirmed = true;
    record.status = "confirmed";
    return { ...record, status: record.status, ticketCode: ticketCode(record.id) };
  });

  json(res, 200, booking);
});