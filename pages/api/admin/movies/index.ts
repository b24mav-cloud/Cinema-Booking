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
  if (req.method === "GET") return json(res, 200, store.movies);
  if (req.method === "POST") {
    const input = (await readBody<MovieInput>(req)) ?? {};
    const result = validateMovieInput(input);
    if (Object.keys(result.errors).length) return json(res, 400, { error: "Please fix the highlighted fields.", errors: result.errors });
    const values = result.values!;
    const movie: Movie = {
      id: Math.max(0, ...store.movies.map(item => item.id)) + 1,
      title: values.title,
      description: values.description,
      synopsis: values.description,
      genre: values.genre,
      cast: values.cast,
      durationMinutes: values.durationMinutes,
      posterUrl: values.posterUrl,
      status: values.status,
      releaseDate: null,
      tags: [values.genre],
      basePrice: 450
    };
    store.movies.push(movie);
    await writeStore(store);
    return json(res, 201, movie);
  }
  json(res, 404, { error: "Not found" });
});