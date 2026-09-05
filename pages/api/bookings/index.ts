import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../lib/api/store";
import { decorateShowtime } from "../../../lib/api/cinema";
import { getSessionUser } from "../../../lib/api/auth";
import { json, readBody, wrap } from "../../../lib/api/respond";
import type { AddOnSelection, SeatSnapshot } from "../../../lib/types";

const catalog: Record<string, { name: string; price: number }> = {
  popcorn: { name: "Classic popcorn", price: 180 },
  combo: { name: "Movie night combo", price: 320 },
  nachos: { name: "Loaded nachos", price: 220 }
};

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  if (req.method === "POST") {
    const input = await readBody<{
      showtimeId?: number;
      seatIds?: number[];
      userEmail?: string;
      addOns?: string[];
      paymentMethod?: string;
    }>(req);
    const seatIds = [...new Set(input?.seatIds ?? [])];
    if (!input?.userEmail?.trim()) return json(res, 400, "UserEmail is required.");
    if (!seatIds.length) return json(res, 400, "At least one seat is required.");
    const showtime = store.showtimes.find(item => item.id === Number(input.showtimeId));
    if (!showtime) return json(res, 404, `Showtime ${input.showtimeId} was not found.`);
    const seatObjects = showtime.seats.filter(seat => seatIds.includes(seat.id));
    if (seatObjects.length !== seatIds.length) return json(res, 400, "One or more seats do not belong to the selected showtime.");
    if (seatObjects.some(seat => seat.status !== "Available")) return json(res, 409, "One or more selected seats are no longer available.");
    seatObjects.forEach(seat => { seat.status = "Reserved"; });
    const addOnSelections: AddOnSelection[] = [...new Set(input.addOns ?? [])]
      .filter(item => catalog[item])
      .map(item => ({ id: item, ...catalog[item] }));
    const seatTotal = seatObjects.reduce((total, seat) => total + Number(seat.price || 0), 0);
    const totalAmount = seatTotal + addOnSelections.reduce((total, item) => total + item.price, 0);
    const customer = await getSessionUser(req, res);
    const booking = {
      id: randomUUID(),
      showtimeId: showtime.id,
      customerId: customer?.role === "customer" ? customer.id : null,
      userEmail: input.userEmail.trim(),
      movieTitle: store.movies.find(movie => movie.id === showtime.movieId)?.title ?? "Unknown movie",
      auditorium: showtime.auditorium,
      seatSnapshot: seatObjects.map(seat => ({ row: seat.row, number: seat.number, price: seat.price }) as SeatSnapshot),
      addOns: addOnSelections,
      paymentMethod: input.paymentMethod ?? "GCash",
      totalAmount,
      createdAt: new Date().toISOString(),
      isConfirmed: false
    };
    store.bookings.push(booking);
    await writeStore(store);
    json(res, 201, booking, { Location: `/api/bookings/${booking.id}` });
    return;
  }
  json(res, 404, { error: "Not found" });
});
