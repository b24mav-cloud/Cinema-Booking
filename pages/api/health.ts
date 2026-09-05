import type { NextApiRequest, NextApiResponse } from "next";
import { json, wrap } from "../../lib/api/respond";

export default wrap(async (_req: NextApiRequest, res: NextApiResponse) => {
  json(res, 200, { status: "healthy" });
});
