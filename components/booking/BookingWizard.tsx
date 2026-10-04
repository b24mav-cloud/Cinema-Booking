import { useEffect, useState } from "react";
import { MovieBrowser } from "../MovieBrowser";
import type { BannerTab } from "../HeroBanner";
import { SeatMap } from "./SeatMap";
import { OrderSummary } from "./OrderSummary";
import { ConfirmationPanel } from "./ConfirmationPanel";
import type { BookingFlow } from "../../lib/useBookingFlow";
import { apiFetch } from "../../lib/api/client";
import { peso } from "../../lib/types";

const STEPS = ["Select film", "Showtime", "Seats", "Add-ons", "Summary"] as const;

const PAYMENT_METHODS = [
  { id: "GCash", label: "GCash", note: "Pay from your GCash wallet" },
  { id: "Maya", label: "Maya", note: "Pay with your Maya balance" },
  { id: "Card", label: "Card", note: "Debit or credit card" }
];

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function BookingWizard({ flow, browseTab, onTabChange }: {
  flow: BookingFlow;
  browseTab: BannerTab;
  onTabChange: (tab: BannerTab) => void;
}) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    apiFetch<{ user: unknown }>("/api/auth/me")
      .then(result => setSignedIn(Boolean(result?.user)))
      .catch(() => setSignedIn(false));
  }, []);

  if (flow.loading) {
    return (
      <div className="wizard-loading" aria-busy="true" aria-live="polite">
        <div className="skeleton skeleton-strip" />
        <div className="skeleton skeleton-strip short" />
        <span className="muted">Loading what&apos;s on tonight…</span>
      </div>
    );
  }

  if (flow.loadError) {
    return (
      <div className="panel-error" role="alert">
        <p className="error">{flow.loadError}</p>
        <button className="button gold-button" onClick={() => flow.reload()}>Try again</button>
      </div>
    );
  }

  if (flow.confirmation) {
    return <ConfirmationPanel booking={flow.confirmation} signedIn={signedIn} onDone={flow.reset} />;
  }

  const summary = (
    <OrderSummary
      movieTitle={flow.movie?.title}
      movieId={flow.movie?.id}
      showtime={flow.showtime}
      seats={flow.selectedSeats}
      extras={flow.extras}
      catalog={flow.catalog}
      seatTotal={flow.seatTotal}
      extrasTotal={flow.extrasTotal}
      total={flow.total}
      step={flow.step}
    />
  );

  return (
    <>
      <ol className="wizard" aria-label="Booking progress">
        {STEPS.map((label, index) => {
          const position = index + 1;
          const state = flow.step === position ? "active" : flow.step > position ? "done" : "";
          return (
            <li key={label}>
              <button
                type="button"
                className={`wizard-step ${state}`}
                aria-current={flow.step === position ? "step" : undefined}
                disabled={position > flow.step}
                onClick={() => position <= flow.step && flow.goToStep(position as 1 | 2 | 3 | 4 | 5)}
              >
                <b>{position < 10 ? `0${position}` : position}</b>
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {flow.error && <p className="error" role="alert">{flow.error}</p>}
      {flow.notice && <p className="notice" role="status">{flow.notice}</p>}

      {flow.step === 1 && (
        <MovieBrowser
          movies={flow.movies}
          activeTab={browseTab}
          onTabChange={onTabChange}
          selectedId={flow.movie?.id}
          onSelect={flow.chooseMovie}
        />
      )}

      {flow.step === 2 && (
        <div className="showtime-layout">
          <div className="panel">
            <p className="kicker">AVAILABLE SHOWTIMES</p>
            <h3>{flow.movie?.title}</h3>
            {flow.movieShows.length === 0 ? (
              <p className="muted">No showtimes scheduled for this film yet. Check back soon.</p>
            ) : (
              <div className="showtime-grid">
                {flow.movieShows.map(item => (
                  <button
                    type="button"
                    className={`showtime ${flow.showtime?.id === item.id ? "chosen" : ""}`}
                    key={item.id}
                    onClick={() => flow.chooseShowtime(item)}
                  >
                    <b>{clock(item.startTime)}</b>
                    <small>
                      {item.auditoriumType === "vip" && <span className="vip-badge">VIP</span>} {item.experience ?? "Standard"} · {item.auditorium}
                    </small>
                    <em>from {peso(item.price ?? item.seats[0]?.price ?? 450)}</em>
                  </button>
                ))}
              </div>
            )}
          </div>
          {summary}
        </div>
      )}

      {flow.step === 3 && flow.showtime && (
        <div className="seats-layout">
          <div className="seat-card">
            <div className="seat-card-head">
              <div>
                <p className="kicker">AUDITORIUM {flow.showtime.auditorium}</p>
                <h3>Choose your seats</h3>
              </div>
              <span className="seat-count">{flow.seats.length} selected</span>
            </div>
            <SeatMap
              seats={flow.showtime.seats}
              selected={flow.seats}
              isVip={flow.showtime.auditoriumType === "vip"}
              onToggle={flow.toggleSeat}
              onSelectSeats={ids => void flow.selectSeats(ids)}
            />
          </div>
          {summary}
        </div>
      )}

      {flow.step === 4 && (
        <div className="addon-layout">
          <div className="panel">
            <p className="kicker">MAKE IT A NIGHT</p>
            <h3>Something to enjoy?</h3>
            {flow.catalog.length === 0 ? (
              <p className="muted">No concessions available right now.</p>
            ) : (
              <div className="addon-grid">
                {flow.catalog.map(item => (
                  <label className={`addon ${flow.extras.includes(item.id) ? "chosen" : ""}`} key={item.id}>
                    <input
                      type="checkbox"
                      checked={flow.extras.includes(item.id)}
                      onChange={() => flow.toggleExtra(item.id)}
                    />
                    <span className="addon-icon" aria-hidden="true">{item.icon}</span>
                    <span>
                      <b>{item.name}</b>
                      <small>{item.description}</small>
                    </span>
                    <strong>{peso(item.price)}</strong>
                  </label>
                ))}
              </div>
            )}
          </div>
          {summary}
        </div>
      )}

      {flow.step === 5 && (
        <div className="summary-layout">
          <div className="summary-card">
            <p className="kicker">YOUR ITINERARY</p>
            <h3>{flow.movie?.title}</h3>
            <p className="muted">{flow.showtime?.auditorium}</p>
            <p className="muted">{flow.showtime && new Date(flow.showtime.startTime).toLocaleString()}</p>
            <div className="summary-seats">
              <span>Seats</span>
              <b>{flow.selectedSeats.map(seat => `${seat.row}${seat.number}`).join(", ") || "—"}</b>
            </div>
            {flow.extras.length > 0 && (
              <div className="summary-seats">
                <span>Concessions</span>
                <b>{flow.extras.map(id => flow.catalog.find(item => item.id === id)?.name).filter(Boolean).join(", ")}</b>
              </div>
            )}
            <div className="order-total">
              <span>Total</span>
              <strong>{peso(flow.total)}</strong>
            </div>
          </div>

          <form
            className="payment-card"
            onSubmit={event => {
              event.preventDefault();
              void flow.book();
            }}
          >
            <p className="kicker">PAYMENT DETAILS</p>
            <h3>How would you like to pay?</h3>
            <div className="payment-methods">
              {PAYMENT_METHODS.map(method => (
                <label key={method.id}>
                  <input
                    type="radio"
                    name="payment"
                    value={method.id}
                    checked={flow.payment === method.id}
                    onChange={() => flow.setPayment(method.id)}
                  />
                  <span>
                    <b>{method.label}</b>
                    <small>{method.note}</small>
                  </span>
                </label>
              ))}
            </div>
            <label className="field">
              Email address
              <input
                type="email"
                value={flow.email}
                onChange={event => flow.setEmail(event.target.value)}
                required
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            <p className="muted payment-note">
              {signedIn ? "We'll send the receipt to this address." : "Create an account after checkout to keep every ticket in one place."}
            </p>
            <button className="button gold-button button-full" type="submit" disabled={flow.submitting || !flow.hold}>
              {flow.submitting ? "Confirming…" : `Confirm booking · ${peso(flow.total)}`}
            </button>
          </form>
        </div>
      )}

      <div className="wizard-actions">
        <button className="button back-button" hidden={flow.step === 1} onClick={() => void flow.back()}>← Back</button>
        <button className="button gold-button" hidden={flow.step >= 5} onClick={() => void flow.next()}>Continue →</button>
      </div>
    </>
  );
}