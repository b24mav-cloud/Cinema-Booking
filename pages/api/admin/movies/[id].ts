import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../../lib/api/store";
import { requireUser } from "../../../../lib/api/auth";
import { json, readBody, wrap } from "../../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const auth = await requireUser(req, res, "admin");
  if (auth.error) return json(res, auth.status, auth.error);
  if (req.method === "PATCH") {
    const id = Number(req.query.id);
    const movie = store.movies.find(item => item.id === id);
    if (!movie) return json(res, 404, "Movie was not found.");
    const input = (await readBody<Record<string, unknown>>(req)) ?? {};
    Object.assign(movie, input);
    if (input.status === "archived") movie.archivedAt = new Date().toISOString();
    await writeStore(store);
    return json(res, 200, movie);
  }
  json(res, 404, { error: "Not found" });
});