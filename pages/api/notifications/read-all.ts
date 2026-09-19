import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../lib/api/store";
import { requireUser } from "../../../lib/api/auth";
import { mine } from "../../../lib/api/notifications";
import { json, wrap } from "../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  if (req.method !== "POST") return json(res, 404, { error: "Not found" });
  const auth = await requireUser(req, res);
  if (auth.error || !auth.user) return json(res, auth.status ?? 401, { error: auth.error ?? "Authentication required." });
  const now = new Date().toISOString();
  mine(store, auth.user).forEach(notification => { notification.readAt = notification.readAt ?? now; });
  await writeStore(store);
  return json(res, 200, { ok: true });
});