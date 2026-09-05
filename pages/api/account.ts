import type { NextApiRequest, NextApiResponse } from "next";
import { readStore } from "../../lib/api/store";
import { decorateShowtime } from "../../lib/api/cinema";
import { requireUser } from "../../lib/api/auth";
import { json, wrap } from "../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  if (req.method !== "GET") return json(res, 404, { error: "Not found" });
  const auth = await requireUser(req, res, "customer");
  if (auth.error || !auth.user) return json(res, auth.status ?? 401, auth.error ?? "Authentication required.");
  const user = auth.user;
  const bookings = store.bookings.filter(item => item.customerId === user.id || (!item.customerId && item.userEmail === user.email));
  return json(res, 200, bookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(item => {
    const showtime = store.showtimes.find(showtime => showtime.id === item.showtimeId);
    return { ...item, showtime: showtime ? decorateShowtime(showtime, store) : null };
  }));
});