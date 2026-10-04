import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Booking } from "../types";
import { TICKET_CODE_PREFIX } from "../booking";

/**
 * Server-only booking helpers.
 *
 * Re-exports the shared logic from `lib/booking` so API routes keep one import
 * site, and adds the pieces that need `node:crypto`.
 */

// Browser-safe helpers live in lib/booking so React components can use them.
export * from "../booking";

/**
 * Ticket codes are what door staff scan, so the payload must not be guessable
 * from the booking id and must be reproducible: the scanner has to recompute or
 * look up exactly the code printed on the ticket.
 *
 * With `TICKET_SIGNING_SECRET` set, the payload is an HMAC of the booking id.
 * Without it we fall back to a SHA-256 digest of the id, which is still derived
 * from a random UUIDv4, so it is not enumerable even though it is unkeyed.
 * Codes are also persisted on the booking so validation never has to depend on
 * the secret staying unchanged between deployment and redemption.
 */
export function ticketCode(bookingId: string): string {
  const secret = process.env.TICKET_SIGNING_SECRET;
  const payload = secret
    ? createHmac("sha256", secret).update(bookingId).digest("hex")
    : createHash("sha256").update(`cinema-ticket:${bookingId}`).digest("hex");
  return `${TICKET_CODE_PREFIX}-${payload.slice(0, 16).toUpperCase()}`;
}

export function newBookingId(): string {
  return randomUUID();
}

/**
 * The code to show and to scan for a booking. Newer bookings carry their code,
 * so a later secret rotation cannot invalidate tickets already in circulation;
 * older records fall back to the derived value.
 */
export const bookingTicketCode = (booking: Pick<Booking, "id" | "ticketCode">): string =>
  booking.ticketCode || ticketCode(booking.id);