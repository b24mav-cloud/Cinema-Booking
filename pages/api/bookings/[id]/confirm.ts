import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../../lib/api/store";
import { json, wrap } from "../../../../lib/api/respond";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const id = String(req.query.id);
  if (req.method === "POST") {
    const booking = store.bookings.find(item => item.id === id);
    if (!booking) return json(res, 404, {});
    booking.isConfirmed = true;
    await writeStore(store);
    json(res, 200, booking);
    return;
  }
  json(res, 404, { error: "Not found" });
});
