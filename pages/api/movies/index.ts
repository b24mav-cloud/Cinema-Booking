import type { NextApiRequest, NextApiResponse } from "next";
import { readStore } from "../../../lib/api/store";
import { decorateMovie } from "../../../lib/api/cinema";
import { json, wrap } from "../../../lib/api/respond";

export default wrap(async (_req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const visibleMovies = store.movies.filter(item => item.status !== "archived");
  json(res, 200, visibleMovies.map(item => decorateMovie(item, store)));
});
