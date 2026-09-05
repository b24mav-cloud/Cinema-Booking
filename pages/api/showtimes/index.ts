import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../lib/api/store";
import { createShowtime, decorateShowtime } from "../../../lib/api/cinema";
import { json, readBody, wrap } from "../../../lib/api/respond";
import type { NewShowtimeInput } from "../../../lib/api/cinema";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  if (req.method === "GET") {
    json(res, 200, store.showtimes.map(item => ({ ...decorateShowtime(item, store), seats: item.seats })));
    return;
  }
  if (req.method === "POST") {
    const input = await readBody<NewShowtimeInput>(req);
    const result = createShowtime(store, input ?? {});
    if (result.error || !result.showtime) return json(res, result.status ?? 400, result.error ?? "Movie does not exist.");
    store.showtimes.push(result.showtime);
    await writeStore(store);
    json(res, 201, decorateShowtime(result.showtime, store), { Location: `/api/showtimes/${result.showtime.id}` });
    return;
  }
  json(res, 404, { error: "Not found" });
});
