import type { NextApiRequest, NextApiResponse } from "next";
import { clearSession } from "../../../lib/api/auth";
import { json, wrap } from "../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") return json(res, 404, { error: "Not found" });
  clearSession(res);
  json(res, 204, {});
});