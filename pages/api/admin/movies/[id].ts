import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../../lib/api/store";
import { validateMovieInput } from "../../../../lib/api/cinema";
import { requireUser } from "../../../../lib/api/auth";
import { json, readBody, wrap } from "../../../../lib/api/respond";
import type { Movie } from "../../../../lib/types";

type MovieInput = { title?: string; genre?: string; durationMinutes?: number; status?: string; cast?: string; description?: string; posterUrl?: string };

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const auth = await requireUser(req, res, "admin");
  if (auth.error) return json(res, auth.status, auth.error);
  if (req.method === "PATCH") {
    const id = Number(req.query.id);
    const movie = store.movies.find(item => item.id === id);
    if (!movie) return json(res, 404, "Movie was not found.");
    const input = (await readBody<MovieInput>(req)) ?? {};
    if ("status" in input && Object.values(input).every(value => value === undefined || value === "")) {
      if (!["now showing", "coming soon", "archived"].includes(String(input.status))) return json(res, 400, "Choose a valid status.");
      movie.status = input.status as string;
      if (movie.status === "archived") movie.archivedAt = new Date().toISOString();
      await writeStore(store);
      return json(res, 200, movie);
    }
    const merged: MovieInput = {
      title: input.title ?? movie.title,
      genre: input.genre ?? movie.genre ?? "",
      durationMinutes: input.durationMinutes ?? movie.durationMinutes,
      status: input.status ?? movie.status ?? "coming soon",
      cast: input.cast ?? movie.cast,
      description: input.description ?? movie.description,
      posterUrl: input.posterUrl ?? movie.posterUrl
    };
    const result = validateMovieInput(merged);
    if (Object.keys(result.errors).length) return json(res, 400, { error: "Please fix the highlighted fields.", errors: result.errors });
    const values = result.values!;
    Object.assign(movie, values);
    movie.archivedAt = movie.status === "archived" ? new Date().toISOString() : undefined;
    await writeStore(store);
    return json(res, 200, movie);
  }
  json(res, 404, { error: "Not found" });
});