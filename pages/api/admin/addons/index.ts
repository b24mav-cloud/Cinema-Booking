import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "node:crypto";
import { readStore, writeStore } from "../../../../lib/api/store";
import { requireUser } from "../../../../lib/api/auth";
import { json, readBody, wrap } from "../../../../lib/api/respond";
import type { AddOn } from "../../../../lib/types";

type AddOnInput = { id?: string; name?: string; description?: string; price?: number; icon?: string; comboOf?: string[] };

const cleanCombo = (store: { addOns?: AddOn[] }, input: AddOnInput, selfId?: string): string[] | undefined => {
  const list = input.comboOf;
  if (list === undefined) return undefined;
  const ids = [...new Set(list)].filter(id => id && id !== selfId);
  const known = new Set((store.addOns ?? []).map(item => item.id));
  if (ids.some(id => !known.has(id))) return undefined;
  return ids;
};

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const auth = await requireUser(req, res, "admin");
  if (auth.error) return json(res, auth.status, auth.error);
  if (req.method === "GET") return json(res, 200, store.addOns ?? []);
  if (req.method === "POST") {
    const input = (await readBody<AddOnInput>(req)) ?? {};
    const name = input.name?.trim() ?? "";
    const price = Number(input.price);
    if (!name) return json(res, 400, { error: "Add-on name is required." });
    if (!Number.isFinite(price) || price <= 0) return json(res, 400, { error: "Price must be a positive number." });
    let comboOf: string[] | undefined;
    if (input.comboOf && input.comboOf.length) {
      comboOf = cleanCombo(store, input);
      if (!comboOf) return json(res, 400, { error: "Combo members must be existing add-ons." });
    }
    const id = input.id?.trim() || randomUUID();
    if ((store.addOns ?? []).some(item => item.id === id)) return json(res, 400, { error: "That add-on id already exists." });
    const addOn: AddOn = {
      id,
      name,
      description: input.description?.trim() ?? "",
      price,
      icon: input.icon?.trim() || "🍿",
      comboOf
    };
    store.addOns = store.addOns ?? [];
    store.addOns.push(addOn);
    await writeStore(store);
    return json(res, 201, addOn);
  }
  json(res, 404, { error: "Not found" });
});