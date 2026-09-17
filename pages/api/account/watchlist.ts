import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../lib/api/store";
import { requireUser } from "../../../lib/api/auth";
import { json, readBody, wrap } from "../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const auth = await requireUser(req, res, "customer");
  if (auth.error || !auth.user) return json(res, auth.status ?? 401, auth.error ?? "Authentication required.");
  const user = auth.user;

  if (req.method === "GET") {
    const ids = store.watchlists?.[user.id] ?? [];
    const movies = store.movies.filter(m => ids.includes(m.id));
    return json(res, 200, { ids, movies });
  }

  if (req.method === "POST") {
    const body = await readBody<{ movieId?: number }>(req);
    const movieId = Number(body?.movieId);
    if (!movieId) return json(res, 400, { error: "movieId is required." });
    const movie = store.movies.find(m => m.id === movieId);
    if (!movie) return json(res, 404, { error: "Movie not found." });

    store.watchlists = store.watchlists ?? {};
    const current = store.watchlists[user.id] ?? [];
    const idx = current.indexOf(movieId);
    const action = idx === -1 ? "added" : "removed";
    store.watchlists[user.id] = idx === -1 ? [...current, movieId] : current.filter(id => id !== movieId);
    await writeStore(store);
    return json(res, 200, { action, ids: store.watchlists[user.id] });
  }

  json(res, 404, { error: "Not found" });
});
