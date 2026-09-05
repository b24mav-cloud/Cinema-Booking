import type { NextApiRequest, NextApiResponse } from "next";
import { readStore } from "../../../lib/api/store";
import { decorateShowtime } from "../../../lib/api/cinema";
import { json, wrap } from "../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const id = String(req.query.id);
  if (req.method === "GET") {
    const booking = store.bookings.find(item => item.id === id);
    if (!booking) return json(res, 404, {});
    const showtime = store.showtimes.find(item => item.id === booking.showtimeId);
    json(res, 200, { ...booking, showtime: showtime ? decorateShowtime(showtime, store) : null });
    return;
  }
  json(res, 404, { error: "Not found" });
});
