import type { NextApiRequest, NextApiResponse } from "next";
import { mutateStore } from "../../../lib/api/store";
import { getSessionUser } from "../../../lib/api/auth";
import { HttpError, json, readBody, wrap } from "../../../lib/api/respond";

/**
 * Releases a single seat hold.
 *
 * `DELETE /api/holds/<holdId>` is the normal path. `POST` with `?release=1`
 * exists because `navigator.sendBeacon` can only POST, and that is the only way
 * to release a hold when the tab closes mid-checkout.
 *
 * Ownership is enforced either way, so guessing a hold id cannot free someone
 * else's seats.
 */
export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const releasing = req.method === "DELETE" || (req.method === "POST" && req.query.release === "1");
  if (!releasing) throw new HttpError(404, "Not found");

  const holdId = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!holdId || holdId === "undefined" || holdId === "null") throw new HttpError(400, "A hold id is required.");

  const user = await getSessionUser(req, res);
  const input = await readBody<{ ownerToken?: string }>(req);
  const owner = user?.id ?? (input?.ownerToken ?? "").trim();
  if (!owner) throw new HttpError(401, "Sign in or send your hold token to release this hold.");

  await mutateStore(store => {
    const target = (store.seatHolds ?? []).find(hold => hold.id === holdId);
    // Distinguish "not there" from "not yours": a beacon that fires twice, or one
    // that races a completed booking, is fine and reports 204.
    if (!target) {
      if (req.method === "DELETE") throw new HttpError(404, "That hold no longer exists.");
      return;
    }
    if (target.owner !== owner) throw new HttpError(403, "This hold belongs to another session.");
    store.seatHolds = (store.seatHolds ?? []).filter(hold => hold.id !== holdId);
  });

  json(res, 204, null);
});