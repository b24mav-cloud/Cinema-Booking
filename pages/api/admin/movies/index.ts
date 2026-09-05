import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../../lib/api/store";
import { requireUser } from "../../../../lib/api/auth";
import { json, readBody, wrap } from "../../../../lib/api/respond";
import type { Movie } from "../../../../lib/types";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const auth = await requireUser(req, res, "admin");
  if (auth.error) return json(res, auth.status, auth.error);
  if (req.method === "GET") return json(res, 200, store.movies);
  if (req.method === "POST") {
    const input = await readBody<{ title?: string; description?: string; genre?: string; cast?: string; durationMinutes?: number; posterUrl?: string; status?: string; releaseDate?: string; basePrice?: number }>(req);
    if (!input?.title?.trim()) return json(res, 400, "Movie title is required.");
    const movie: Movie = { id: Math.max(0, ...store.movies.map(item => item.id)) + 1, title: input.title.trim(), description: input.description ?? "", synopsis: input.description ?? "", genre: input.genre ?? "", cast: input.cast ?? "", durationMinutes: Number(input.durationMinutes ?? 0), posterUrl: input.posterUrl ?? "", status: input.status ?? "coming soon", releaseDate: input.releaseDate ?? null, tags: input.genre ? [input.genre] : [], basePrice: Number(input.basePrice ?? 450) };
    store.movies.push(movie);
    await writeStore(store);
    return json(res, 201, movie);
  }
  json(res, 404, { error: "Not found" });
});