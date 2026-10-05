import type { NextApiRequest, NextApiResponse } from "next";
import type { AuditoriumStatus, SeatStatus } from "../../../../lib/types";
import { readStore, writeStore } from "../../../../lib/api/store";
import { seatId, syncAuditoriumSeats } from "../../../../lib/api/cinema";
import { requireUser } from "../../../../lib/api/auth";
import { json, readBody, wrap } from "../../../../lib/api/respond";

const STATUSES: AuditoriumStatus[] = ["Open", "Maintenance", "Closed"];
const SEAT_STATUSES: SeatStatus[] = ["Available", "Reserved", "OutOfService"];
/** A regular hall is 9 rows of 18 = 162, so the old 60-seat cap had to go. */
const MAX_SEATS = 400;

export default wrap(async (req: NextApiRequest, res: NextApiResponse) => {
  const store = await readStore();
  const auth = await requireUser(req, res, "admin");
  if (auth.error) return json(res, auth.status, auth.error);
  const id = Number(req.query.id);
  const auditorium = store.auditoriums.find(item => item.id === id);
  if (!auditorium) return json(res, 404, { error: "Auditorium was not found." });
  if (req.method === "GET") return json(res, 200, auditorium);
  if (req.method === "PATCH") {
    const input = (await readBody<{ status?: string; seats?: unknown[] }>(req)) ?? {};
    if (input.status !== undefined) {
      if (!STATUSES.includes(input.status as AuditoriumStatus)) return json(res, 400, { error: "Invalid auditorium status." });
      auditorium.status = input.status as AuditoriumStatus;
    }
    if (Array.isArray(input.seats)) {
      if (input.seats.length === 0 || input.seats.length > MAX_SEATS) return json(res, 400, { error: `A seat map needs between 1 and ${MAX_SEATS} seats.` });
      const seats = input.seats.map((raw, i) => {
        const seat = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const row = String(seat.row ?? "").toUpperCase();
        const number = Number(seat.number);
        const status = SEAT_STATUSES.includes(seat.status as SeatStatus) ? (seat.status as SeatStatus) : "Available";
        // `seatId` strides by 1000, so hall seat ids stay unique and far away
        // from the old `hallId * 100 + i + 1` scheme, which collided at 162.
        return {
          id: seatId(auditorium.id, i),
          row,
          number,
          price: Number(seat.price) || 0,
          status,
          variant: seat.variant === "recliner" ? ("recliner" as const) : ("standard" as const),
          // Keep the section grouping the editor renders from; dropping it here
          // would collapse a hall to one block on the next save.
          ...(seat.sectionId ? { sectionId: String(seat.sectionId) } : {})
        };
      });
      if (seats.some(seat => !seat.row || !Number.isInteger(seat.number) || seat.number < 1)) return json(res, 400, { error: "Seat map is malformed." });
      auditorium.seats = seats;
    }
    if (input.status === undefined && input.seats === undefined) return json(res, 400, { error: "Nothing to update." });
    const syncedShowtimes = syncAuditoriumSeats(store, auditorium);
    await writeStore(store);
    return json(res, 200, { ...auditorium, syncedShowtimes });
  }
  return json(res, 404, { error: "Not found" });
});