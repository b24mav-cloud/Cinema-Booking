import type { NextApiRequest, NextApiResponse } from "next";
import { readStore } from "../../lib/api/store";
import { decorateShowtime } from "../../lib/api/cinema";
import { requireUser } from "../../lib/api/auth";
import { bookingStatus, bookingTicketCode, isCancellable, seatLabels } from "../../lib/api/bookings";
import { HttpError, json, wrap } from "../../lib/api/respond";
import { CANCELLATION_CUTOFF_MS } from "../../lib/api/store";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") throw new HttpError(404, "Not found");
  const auth = await requireUser(req, res, "customer");
  if (auth.error || !auth.user) throw new HttpError(auth.status ?? 401, auth.error ?? "Authentication required.");
  const user = auth.user;

  const store = await readStore();
  const bookings = store.bookings.filter(
    item => item.customerId === user.id || (!item.customerId && item.userEmail.toLowerCase() === user.email.toLowerCase())
  );

  const rows = bookings
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(item => {
      const showtime = store.showtimes.find(candidate => candidate.id === item.showtimeId);
      const decorated = showtime ? decorateShowtime(showtime, store) : null;
      return {
        ...item,
        status: bookingStatus(item),
        ticketCode: bookingTicketCode(item),
        seats: seatLabels(item.seatSnapshot),
        cancellable: isCancellable({ ...item, showtime: decorated ?? undefined }, CANCELLATION_CUTOFF_MS),
        showtime: decorated
      };
    });

  json(res, 200, rows);
});