import type { NextApiRequest, NextApiResponse } from "next";
import { readStore } from "../../../lib/api/store";
import { requireUser } from "../../../lib/api/auth";
import { mine } from "../../../lib/api/notifications";
import { json, wrap } from "../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  if (req.method !== "GET") return json(res, 404, { error: "Not found" });
  const auth = await requireUser(req, res);
  if (auth.error || !auth.user) return json(res, auth.status ?? 401, { error: auth.error ?? "Authentication required." });
  return json(res, 200, mine(store, auth.user));
});