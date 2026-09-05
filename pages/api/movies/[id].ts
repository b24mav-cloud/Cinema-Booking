import type { NextApiRequest, NextApiResponse } from "next";
import { readStore } from "../../../lib/api/store";
import { decorateMovie } from "../../../lib/api/cinema";
import { json, wrap } from "../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const id = Number(req.query.id);
  const movie = store.movies.find(item => item.id === id && item.status !== "archived");
  if (!movie) return json(res, 404, {});
  json(res, 200, decorateMovie(movie, store));
});
