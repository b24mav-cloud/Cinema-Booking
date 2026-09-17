import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../lib/api/store";
import { requireUser } from "../../../lib/api/auth";
import { json, readBody, wrap } from "../../../lib/api/respond";
import type { Rating } from "../../../lib/types";

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const auth = await requireUser(req, res, "customer");
  if (auth.error || !auth.user) return json(res, auth.status ?? 401, auth.error ?? "Authentication required.");
  const user = auth.user;

  if (req.method === "GET") {
    const mine = (store.ratings ?? []).filter(r => r.userId === user.id);
    return json(res, 200, { ratings: mine });
  }

  if (req.method === "POST") {
    const body = await readBody<{ bookingId?: string; stars?: number }>(req);
    const bookingId = String(body?.bookingId ?? "").trim();
    const stars = Number(body?.stars);
    if (!bookingId) return json(res, 400, { error: "bookingId is required." });
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return json(res, 400, { error: "Rating must be between 1 and 5 stars." });
    const booking = store.bookings.find(b => b.id === bookingId);
    if (!booking) return json(res, 404, { error: "Booking was not found." });
    if (booking.customerId !== user.id && booking.userEmail !== user.email) return json(res, 403, { error: "You can only rate your own bookings." });

    store.ratings = store.ratings ?? [];
    const existing = store.ratings.find(r => r.bookingId === bookingId && r.userId === user.id);
    if (existing) {
      existing.stars = stars;
      existing.updatedAt = new Date().toISOString();
      await writeStore(store);
      return json(res, 200, existing);
    }
    const showtime = store.showtimes.find(s => s.id === booking.showtimeId);
    const rating: Rating = {
      id: randomUUID(),
      bookingId,
      movieId: showtime?.movieId ?? 0,
      userId: user.id,
      stars,
      updatedAt: new Date().toISOString()
    };
    store.ratings.push(rating);
    await writeStore(store);
    return json(res, 201, rating);
  }

  json(res, 404, { error: "Not found" });
});