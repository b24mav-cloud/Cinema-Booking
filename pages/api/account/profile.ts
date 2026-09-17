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
    const profile = store.profiles?.[user.id] ?? {};
    return json(res, 200, {
      name: profile.name ?? (user.metadata?.name as string) ?? user.email.split("@")[0],
      mobile: profile.mobile ?? "",
      paymentPrefs: profile.paymentPrefs ?? ["GCash"]
    });
  }

  if (req.method === "PATCH") {
    const body = await readBody<{ name?: string; mobile?: string; paymentPrefs?: string[] }>(req);
    const current = store.profiles?.[user.id] ?? {};
    store.profiles = store.profiles ?? {};
    store.profiles[user.id] = {
      name: typeof body?.name === "string" ? body.name : current.name,
      mobile: typeof body?.mobile === "string" ? body.mobile : current.mobile,
      paymentPrefs: Array.isArray(body?.paymentPrefs) ? body.paymentPrefs : current.paymentPrefs
    };
    await writeStore(store);
    return json(res, 200, store.profiles[user.id]);
  }

  json(res, 404, { error: "Not found" });
});
