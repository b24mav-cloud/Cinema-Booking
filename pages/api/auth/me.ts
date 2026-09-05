import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser, isAuthConfigured } from "../../../lib/api/auth";
import { json, wrap } from "../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") return json(res, 404, { error: "Not found" });
  json(res, 200, { configured: isAuthConfigured(), user: await getSessionUser(req, res) });
});