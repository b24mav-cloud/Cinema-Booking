import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { apiDelete, errorMessage } from "../../lib/api/client";
import type { BookingRecord } from "../../lib/useBookingFlow";
import { peso } from "../../lib/types";

type Props = {
  booking: BookingRecord;
  signedIn: boolean;
  onDone: () => void;
};

const longDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

export function ConfirmationPanel({ booking, signedIn, onDone }: Props) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState("");

  const seatText = booking.seatSnapshot.map(seat => `${seat.row}${seat.number}`).join(", ");
  const reference = booking.paymentReference ?? "—";

  const cancel = async () => {
    if (!window.confirm(`Cancel this booking? Seats ${seatText} will be released.`)) return;
    setCancelling(true);
    setError("");
    try {
      await apiDelete(`/api/bookings/${booking.id}`, { body: JSON.stringify({}) });
      setCancelled(true);
    } catch (err) {
      setError(errorMessage(err, "We couldn't cancel that booking."));
    } finally {
      setCancelling(false);
    }
  };

  if (cancelled) {
    return (
      <div className="confirmation">
        <span className="confirm-icon cancelled">Cancelled</span>
        <p className="kicker">BOOKING CANCELLED</p>
        <h2>Your seats are back on sale.</h2>
        <p>
          Seats {seatText} for {booking.movieTitle} were released. Any payment will be refunded to your original method.
        </p>
        <div className="confirmation-actions">
          <button className="button gold-button" onClick={onDone}>Book another film</button>
        </div>
      </div>
    );
  }

  return (
    <div className="confirmation">
      <span className="confirm-icon" aria-hidden="true">✓</span>
      <p className="kicker">YOU'RE ALL SET</p>
      <h2>Enjoy the show.</h2>
      <p>
        {booking.seatSnapshot.length} {booking.seatSnapshot.length === 1 ? "seat" : "seats"} for <strong>{booking.movieTitle}</strong> in {booking.auditorium}.
      </p>

<dl className="confirmation-details" id="confirmDetails">
        <div><dt>When</dt><dd>{booking.showtime ? longDate(booking.showtime.startTime) : "—"}</dd></div>
        <div><dt>Where</dt><dd>{booking.auditorium}</dd></div>
        <div><dt>Seats</dt><dd>{seatText}</dd></div>
        <div><dt>Payment</dt><dd>{booking.paymentMethod} · {reference}</dd></div>
        <div><dt>Total</dt><dd>{peso(booking.totalAmount)}</dd></div>
        <div><dt>Confirmation</dt><dd>#{booking.id.slice(0, 8).toUpperCase()}</dd></div>
      </dl>

      {error && <p className="error" role="alert">{error}</p>}

      {booking.ticketCode && (
        <div className="confirm-ticket-code">
          <span className="kicker">SHOW THIS AT THE DOOR</span>
          <code>{booking.ticketCode}</code>
        </div>
      )}

      <div className="confirmation-actions">
        {signedIn ? (
          <Link className="button gold-button" href="/account">View my tickets</Link>
        ) : (
          <>
            <button
              className="button gold-button"
              onClick={() => router.push("/signin?next=/account")}
            >
              Save to my account
            </button>
            <span className="muted">This ticket is saved in this browser.</span>
          </>
        )}
        <a className="button" href={`/api/bookings/${booking.id}?format=ics`} download={`cinema-${booking.id.slice(0, 8)}.ics`}>
          Add to calendar
        </a>
        <button className="button" onClick={onDone}>Book another film</button>
        <button className="button danger-button" onClick={cancel} disabled={cancelling}>
          {cancelling ? "Cancelling…" : "Cancel booking"}
        </button>
      </div>

      <p className="muted confirmation-note">
        Keep your confirmation code handy — our door staff will scan it to check you in.
      </p>
    </div>
  );
}