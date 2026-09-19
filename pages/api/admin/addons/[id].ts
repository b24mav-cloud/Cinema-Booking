import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../../lib/api/store";
import { requireUser } from "../../../../lib/api/auth";
import { json, readBody, wrap } from "../../../../lib/api/respond";
import type { AddOn } from "../../../../lib/types";

type AddOnInput = { name?: string; description?: string; price?: number; icon?: string; comboOf?: string[] };

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const auth = await requireUser(req, res, "admin");
  if (auth.error) return json(res, auth.status, auth.error);
  const id = String(req.query.id);
  const addOn = (store.addOns ?? []).find(item => item.id === id);
  if (!addOn) return json(res, 404, { error: "Add-on not found." });

  if (req.method === "PATCH") {
    const input = (await readBody<AddOnInput>(req)) ?? {};
    if (input.name !== undefined && !input.name.trim()) return json(res, 400, { error: "Add-on name is required." });
    if (input.price !== undefined && (!Number.isFinite(Number(input.price)) || Number(input.price) <= 0)) return json(res, 400, { error: "Price must be a positive number." });
    const comboOf = input.comboOf === undefined ? (addOn.comboOf ?? []) : [...new Set(input.comboOf)].filter(member => member && member !== id);
    const known = new Set((store.addOns ?? []).map(item => item.id));
    if (comboOf.some(member => !known.has(member))) return json(res, 400, { error: "Combo members must be existing add-ons." });
    addOn.name = input.name?.trim() ?? addOn.name;
    addOn.description = input.description?.trim() ?? addOn.description;
    addOn.price = input.price !== undefined ? Number(input.price) : addOn.price;
    addOn.icon = input.icon?.trim() || addOn.icon;
    addOn.comboOf = comboOf.length ? comboOf : undefined;
    await writeStore(store);
    return json(res, 200, addOn);
  }

  if (req.method === "DELETE") {
    store.addOns = (store.addOns ?? []).filter(item => item.id !== id);
    (store.addOns ?? []).forEach(item => {
      if (item.comboOf) item.comboOf = item.comboOf.filter(member => member !== id);
    });
    await writeStore(store);
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: "Not found" });
});