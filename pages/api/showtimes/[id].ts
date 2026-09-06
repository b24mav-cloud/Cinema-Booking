import type { NextApiRequest, NextApiResponse } from "next";
import { readStore } from "../../../lib/api/store";
import { decorateShowtime, isAuditoriumOpen } from "../../../lib/api/cinema";
import { json, wrap } from "../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const id = Number(req.query.id);
  if (req.method === "GET") {
    const showtime = store.showtimes.find(item => item.id === id);
    if (!showtime || !isAuditoriumOpen(store, showtime.auditorium)) return json(res, 404, {});
    json(res, 200, decorateShowtime(showtime, store));
    return;
  }
  json(res, 404, { error: "Not found" });
});
