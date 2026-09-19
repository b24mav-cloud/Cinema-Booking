import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../../lib/api/store";
import { requireUser } from "../../../../lib/api/auth";
import { json, wrap } from "../../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  if (req.method !== "POST") return json(res, 404, { error: "Not found" });
  const auth = await requireUser(req, res);
  if (auth.error || !auth.user) return json(res, auth.status ?? 401, { error: auth.error ?? "Authentication required." });
  const id = String(req.query.id);
  const notification = (store.notifications ?? []).find(item => item.id === id);
  if (!notification) return json(res, 404, { error: "Notification not found." });
  const isMine = notification.role === "admin" ? auth.user.role === "admin" : notification.userId === auth.user.id;
  if (!isMine) return json(res, 403, { error: "You cannot read this notification." });
  notification.readAt = notification.readAt ?? new Date().toISOString();
  await writeStore(store);
  return json(res, 200, notification);
});