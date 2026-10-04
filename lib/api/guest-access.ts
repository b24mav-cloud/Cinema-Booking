import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Guest checkout access.
 *
 * A guest booking has no `customerId`, but the confirmation screen must still be
 * able to show the ticket, add it to a calendar and cancel it. Requiring a login
 * straight after paying is a bad experience, and relaxing the booking routes to
 * "anyone with the id" is a data leak.
 *
 * So the server issues an HttpOnly cookie listing the booking ids created from
 * this browser, signed so it cannot be edited to name somebody else's booking.
 * The ids themselves are UUIDs, and the cookie is never readable from JS.
 */

const COOKIE = "cinema_booking_access";
const MAX_GRANTS = 20;

const secret = () =>
  process.env.GUEST_ACCESS_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "cinema-local-dev-secret";

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

const readGrants = (req: NextApiRequest): string[] => {
  const raw = req.cookies?.[COOKIE];
  if (!raw) return [];
  const separator = raw.lastIndexOf(".");
  if (separator < 1) return [];
  const payload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return [];
  try {
    const ids = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
};

/** Records that this browser completed `bookingId`, refreshing the cookie. */
export function grantGuestAccess(res: NextApiResponse, bookingId: string) {
  const current = readIdsFromResponseCookie(res);
  const next = [bookingId, ...current.filter(id => id !== bookingId)].slice(0, MAX_GRANTS);
  const payload = Buffer.from(JSON.stringify(next), "utf8").toString("base64url");
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}`
  );
}

/** True when the caller signed in, or completed this booking in this browser. */
export function canAccessBooking(req: NextApiRequest, bookingId: string, customerId: string | null): boolean {
  if (customerId) return false;
  return readGrants(req).includes(bookingId);
}

/** Best-effort read of the ids already granted, for merging on a new grant. */
function readIdsFromResponseCookie(res: NextApiResponse): string[] {
  const existing = res.getHeader("Set-Cookie");
  const raw = Array.isArray(existing) ? existing.join(";") : typeof existing === "string" ? existing : "";
  const match = raw.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!match) return [];
  const value = decodeURIComponent(match[1]);
  const separator = value.lastIndexOf(".");
  if (separator < 1) return [];
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return [];
  try {
    const ids = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}