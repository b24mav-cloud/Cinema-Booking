import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiDelete, apiFetch, apiPost, errorMessage } from "./api/client";
import type { AddOn, MovieWithShowtimes, Seat, Showtime } from "./types";

export const MAX_SEATS = 8;

export type BookingRecord = {
  id: string;
  movieTitle: string;
  auditorium: string;
  seatSnapshot: { row: string; number: number; price: number }[];
  addOns: { id: string; name: string; price: number }[];
  paymentMethod: string;
  totalAmount: number;
  userEmail: string;
  paymentReference?: string;
  ticketCode: string;
  createdAt: string;
  status: string;
  showtime?: { id: number; startTime: string; endTime?: string; auditorium: string; auditoriumType?: "regular" | "vip" };
};

export type HoldState = { holdId: string; expiresAt: string } | null;

const TOKEN_KEY = "cinema_hold_token";

/**
 * Stable per-browser identity for anonymous seat holds. Guest checkout is the
 * default path, so without this token each re-pick would orphan the previous
 * hold and the seats would stay locked for the full window.
 */
export function holdToken(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(TOKEN_KEY);
  if (existing) return existing;
  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  window.localStorage.setItem(TOKEN_KEY, generated);
  return generated;
}

export type Step = 1 | 2 | 3 | 4 | 5;

export function useBookingFlow(initialMovieId?: number) {
  const [movies, setMovies] = useState<MovieWithShowtimes[]>([]);
  const [showtimes, setShowtimes] = useState<Showtime[]>([]);
  const [catalog, setCatalog] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [movie, setMovie] = useState<MovieWithShowtimes>();
  const [showtime, setShowtime] = useState<Showtime>();
  const [seats, setSeats] = useState<number[]>([]);
  const [extras, setExtras] = useState<string[]>([]);
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [payment, setPayment] = useState("GCash");
  const [confirmation, setConfirmation] = useState<BookingRecord>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [hold, setHold] = useState<HoldState>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const holdRef = useRef<HoldState>(null);
  holdRef.current = hold;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [movieList, showtimeList, addOnList] = await Promise.all([
        apiFetch<MovieWithShowtimes[]>("/api/movies"),
        apiFetch<Showtime[]>("/api/showtimes"),
        apiFetch<AddOn[]>("/api/addons")
      ]);
      setMovies(movieList);
      setShowtimes(showtimeList);
      setCatalog(addOnList);
      return { movieList, showtimeList };
    } catch (err) {
      setLoadError(errorMessage(err, "We couldn't load films. Please refresh and try again."));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    load().then(result => {
      if (!active || !result) return;
      if (initialMovieId) {
        const found = result.movieList.find(item => item.id === initialMovieId && item.status !== "archived");
        if (found) {
          setMovie(found);
          setStep(2);
        }
      }
    });
    return () => { active = false; };
  }, [load, initialMovieId]);

  /** Prefill the email from the signed-in session and remember the last choice. */
  useEffect(() => {
    let active = true;
    apiFetch<{ user: { email: string } | null }>("/api/auth/me")
      .then(async result => {
        if (!active) return;
        if (result?.user?.email) setEmail(current => current || result.user!.email);
      })
      .catch(() => undefined);
    apiFetch<{ paymentPrefs?: string[] }>("/api/account/profile")
      .then(profile => {
        if (active && profile?.paymentPrefs?.length) setPayment(profile.paymentPrefs[0]);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  // Hold countdown. On expiry the seats are released server-side too, so the UI
  // just needs to stop pretending they are secured.
  useEffect(() => {
    if (!hold) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.round((new Date(hold.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setHold(null);
        setSeats([]);
        setNotice("Your seat hold expired. Pick your seats again to continue.");
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [hold]);

  // Release the hold if the tab is closed mid-checkout.
  useEffect(() => {
    const onUnload = () => {
      const current = holdRef.current;
      if (!current) return;
      navigator.sendBeacon?.(
        `/api/holds/${current.holdId}?release=1`,
        new Blob([JSON.stringify({ ownerToken: holdToken() })], { type: "application/json" })
      );
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, []);

  const movieShows = showtimes.filter(item => item.movieId === movie?.id);
  const selectedSeats: Seat[] = showtime?.seats.filter(seat => seats.includes(seat.id)) ?? [];
  const seatTotal = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);
  const extrasTotal = extras.reduce((sum, id) => sum + (catalog.find(item => item.id === id)?.price ?? 0), 0);
  const total = seatTotal + extrasTotal;

  const clearHold = useCallback(async () => {
    const current = holdRef.current;
    setHold(null);
    if (!current) return;
    try {
      await apiDelete(`/api/holds/${current.holdId}?release=1`, { body: JSON.stringify({ ownerToken: holdToken() }) });
    } catch {
      // A failed release just means the hold times out on its own.
    }
  }, []);

  const chooseMovie = useCallback((item: MovieWithShowtimes) => {
    setMovie(item);
    setShowtime(undefined);
    setSeats([]);
    setStep(2);
    setError("");
    setNotice("");
  }, []);

  const chooseShowtime = useCallback((item: Showtime) => {
    setShowtime(item);
    setSeats([]);
    setStep(3);
    setError("");
    setNotice("");
  }, []);

  /**
   * Seats are claimed server-side the moment the customer moves off the seat map,
   * so the next person cannot take them while this one shops for popcorn.
   */
  const toggleSeat = useCallback(
    async (seatId: number) => {
      if (!showtime) return;
      setError("");
      const picked = seats.includes(seatId);
      if (!picked && seats.length >= MAX_SEATS) {
        setError(`You can select up to ${MAX_SEATS} seats in one booking.`);
        return;
      }
      const nextSeats = picked ? seats.filter(id => id !== seatId) : [...seats, seatId];
      setSeats(nextSeats);
      if (!nextSeats.length) {
        await clearHold();
        return;
      }
      try {
        const result = await apiPost<{ holdId: string; expiresAt: string }>("/api/holds", {
          showtimeId: showtime.id,
          seatIds: nextSeats,
          ownerToken: holdToken()
        });
        setHold({ holdId: result.holdId, expiresAt: result.expiresAt });
      } catch (err) {
        // Put the optimistic selection back and refresh from the server.
        setSeats(seats);
        if (err instanceof ApiError && err.status === 409) {
          setNotice("Someone got there first — we've refreshed the seat map. Please choose again.");
          await refreshShowtime(showtime.id);
        } else {
          setError(errorMessage(err, "We couldn't hold those seats. Please try again."));
        }
      }
    },
    [seats, showtime, clearHold]
  );

  /** Picks the best contiguous run of `count` seats, centred on the middle row. */
  const autoPickSeats = useCallback(
    (count: number) => {
      if (!showtime) return;
      const rows = [...new Set(showtime.seats.map(seat => seat.row))];
      const middle = rows[Math.floor(rows.length / 2)];
      const ordered = [...rows].sort((a, b) => (a === middle ? -1 : b === middle ? 1 : a.localeCompare(b)));
      const available = showtime.seats.filter(seat => seat.status === "Available");
      for (const row of ordered) {
        const inRow = available.filter(seat => seat.row === row).sort((a, b) => a.number - b.number);
        const run: Seat[] = [];
        for (const seat of inRow) {
          if (run.length && seat.number !== run[run.length - 1].number + 1) run.length = 0;
          run.push(seat);
          if (run.length === count) {
            void toggleSeatMany(run.map(seat => seat.id));
            return;
          }
        }
      }
      setError(`No row has ${count} seats free together. Try fewer seats.`);
    },
    [showtime]
  );

  const toggleSeatMany = useCallback(
    async (seatIds: number[]) => {
      if (!showtime) return;
      setSeats(seatIds);
      try {
        const result = await apiPost<{ holdId: string; expiresAt: string }>("/api/holds", {
          showtimeId: showtime.id,
          seatIds,
          ownerToken: holdToken()
        });
        setHold({ holdId: result.holdId, expiresAt: result.expiresAt });
        setError("");
      } catch (err) {
        setSeats([]);
        if (err instanceof ApiError && err.status === 409) {
          setNotice("Those seats just went. We've refreshed the map — please pick again.");
          await refreshShowtime(showtime.id);
        } else {
          setError(errorMessage(err, "We couldn't hold those seats. Please try again."));
        }
      }
    },
    [showtime]
  );

  /** Pull a single showtime back from the server after a conflict. */
  const refreshShowtime = useCallback(async (showtimeId: number) => {
    try {
      const fresh = await apiFetch<Showtime>(`/api/showtimes/${showtimeId}`);
      setShowtimes(current => current.map(item => (item.id === fresh.id ? fresh : item)));
      setShowtime(fresh);
    } catch {
      // Leave the current map in place; the next attempt will surface the error.
    }
  }, []);

  const goToStep = useCallback(
    async (next: Step) => {
      if (next < 3 && holdRef.current) await clearHold();
      if (next !== 3) setSeats([]);
      setError("");
      setNotice("");
      setStep(next);
    },
    [clearHold]
  );

  const next = useCallback(async () => {
    if (step === 1 && !movie) return setError("Choose a film first.");
    if (step === 2 && !showtime) return setError("Choose a showtime first.");
    if (step === 3 && !seats.length) return setError("Choose at least one seat.");
    if (step === 3 && !hold) return setError("Hold your seats for a moment — pick at least one seat to continue.");
    if (step === 4 && !hold) return setError("Your seat hold expired. Go back and pick your seats again.");
    setError("");
    setStep(Math.min(5, step + 1) as Step);
  }, [step, movie, showtime, seats.length, hold]);

  const back = useCallback(async () => {
    const previous = Math.max(1, step - 1) as Step;
    if (previous < 3) {
      await clearHold();
      setSeats([]);
    }
    setError("");
    setStep(previous);
  }, [step, clearHold]);

  const toggleExtra = useCallback((id: string) => {
    setExtras(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));
  }, []);

  const book = useCallback(async () => {
    if (!showtime || !hold) return setError("Your seat hold expired. Please pick your seats again.");
    setSubmitting(true);
    setError("");
    try {
      const record = await apiPost<BookingRecord>("/api/bookings", {
        showtimeId: showtime.id,
        seatIds: seats,
        holdId: hold.holdId,
        ownerToken: holdToken(),
        userEmail: email,
        addOns: extras,
        paymentMethod: payment
      });
      setHold(null);
      setConfirmation(record);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 409) {
        setHold(null);
        setSeats([]);
        setNotice("That selection was taken while you were checking out. We've refreshed the map — please choose again.");
        await refreshShowtime(showtime.id);
        setStep(3);
      } else {
        setError(errorMessage(err, "We couldn't complete your booking. Please try again."));
      }
    } finally {
      setSubmitting(false);
    }
  }, [showtime, hold, seats, email, extras, payment, refreshShowtime]);

  const reset = useCallback(() => {
    setConfirmation(undefined);
    setMovie(undefined);
    setShowtime(undefined);
    setSeats([]);
    setExtras([]);
    setHold(null);
    setError("");
    setNotice("");
    setStep(1);
  }, []);

  /** Deep link from a movie page: preselect the film and jump to seat picking. */
  const jumpToShowtime = useCallback((showtimeId: number) => {
    const target = showtimes.find(item => item.id === showtimeId);
    if (!target) return;
    const parent = movies.find(item => item.id === target.movieId);
    if (!parent) return;
    setMovie(parent);
    setShowtime(target);
    setSeats([]);
    setStep(3);
    setError("");
  }, [showtimes, movies]);

  return {
    movies,
    showtimes,
    catalog,
    movieShows,
    loading,
    loadError,
    reload: load,
    movie,
    showtime,
    seats,
    selectedSeats,
    extras,
    step,
    setStep,
    email,
    setEmail,
    payment,
    setPayment,
    confirmation,
    error,
    notice,
    submitting,
    hold,
    secondsLeft,
    seatTotal,
    extrasTotal,
    total,
    chooseMovie,
    chooseShowtime,
    toggleSeat,
    autoPickSeats,
    toggleExtra,
    goToStep,
    next,
    back,
    book,
    reset,
    jumpToShowtime
  };
}

export type BookingFlow = ReturnType<typeof useBookingFlow>;