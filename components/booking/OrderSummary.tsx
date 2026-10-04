import Link from "next/link";
import type { AddOn, Seat, Showtime } from "../../lib/types";
import { peso } from "../../lib/types";

type Props = {
  movieTitle?: string;
  movieId?: number;
  showtime?: Showtime;
  seats: Seat[];
  extras: string[];
  catalog: AddOn[];
  seatTotal: number;
  extrasTotal: number;
  total: number;
  step: number;
};

const longDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "Choose a showtime";

export function OrderSummary({ movieTitle, movieId, showtime, seats, extras, catalog, seatTotal, extrasTotal, total, step }: Props) {
  const chosen = extras.map(id => catalog.find(item => item.id === id)).filter((item): item is AddOn => Boolean(item));

  return (
    <aside className="order-card" aria-label="Your order">
      <p className="kicker">YOUR ORDER</p>
      <h3>{movieTitle ?? "Select a film"}</h3>
      {movieTitle && movieId && step === 1 && (
        <Link className="order-change" href={`/movies/${movieId}`}>View film details</Link>
      )}
      <p className="muted">{showtime ? longDate(showtime.startTime) : "Choose a showtime"}</p>
      {showtime && <p className="muted">{showtime.auditorium}{showtime.auditoriumType === "vip" && <span className="vip-badge">VIP</span>}</p>}

      <div className="order-lines">
        <span>
          Seats ({seats.length})
          <b>{peso(seatTotal)}</b>
        </span>
        {seats.length > 0 && (
          <small className="order-seatlist">
            {seats.map(seat => `${seat.row}${seat.number}`).join(", ")}
          </small>
        )}
        {chosen.map(addOn => (
          <span key={addOn.id}>
            {addOn.name}
            <b>{peso(addOn.price)}</b>
          </span>
        ))}
      </div>

      <div className="order-total">
        <span>Total</span>
        <strong>{peso(total)}</strong>
      </div>
      <p className="order-note muted">Seats are held for 8 minutes while you check out.</p>
    </aside>
  );
}