import type { NextApiRequest, NextApiResponse } from "next";
import { readStore } from "../../../lib/api/store";
import { json, wrap } from "../../../lib/api/respond";

export default wrap(async (_req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  json(res, 200, store.addOns ?? []);
});