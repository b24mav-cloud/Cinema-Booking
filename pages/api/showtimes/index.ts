import type { NextApiRequest, NextApiResponse } from "next";
import { mutateStore, readStore } from "../../../lib/api/store";
import { createShowtime, decorateShowtime, isAuditoriumOpen } from "../../../lib/api/cinema";
import { requireUser } from "../../../lib/api/auth";
import { HttpError, json, readBody, wrap } from "../../../lib/api/respond";
import type { NewShowtimeInput } from "../../../lib/api/cinema";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === "GET") {
    const store = await readStore();
    json(res, 200, store.showtimes.filter(item => isAuditoriumOpen(store, item.auditorium)).map(item => ({ ...decorateShowtime(item, store), seats: item.seats })));
    return;
  }
  if (req.method === "POST") {
    // Showtimes are cinema operations, not a customer action. Without this gate
    // any anonymous caller could inject a showtime and its seat map.
    const auth = await requireUser(req, res, "admin");
    if (auth.error || !auth.user) throw new HttpError(auth.status ?? 401, auth.error ?? "Authentication required.");
    const input = await readBody<NewShowtimeInput>(req);
    const showtime = await mutateStore(store => {
      const result = createShowtime(store, input ?? {});
      if (result.error || !result.showtime) throw new HttpError(result.status ?? 400, result.error ?? "Movie does not exist.");
      store.showtimes.push(result.showtime);
      return result.showtime;
    });
    const store = await readStore();
    json(res, 201, decorateShowtime(showtime, store), { Location: `/api/showtimes/${showtime.id}` });
    return;
  }
  throw new HttpError(404, "Not found");
});