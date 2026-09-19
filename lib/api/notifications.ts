import { randomUUID } from "node:crypto";
import type { Notification, Store } from "../types";
import { formatClock } from "./cinema";

export const ADMIN_NOTIFICATION_USER = "admin";

export function pushNotification(store: Store, notification: Notification): boolean {
  store.notifications = store.notifications ?? [];
  if (store.notifications.some(item => item.userId === notification.userId && item.kind === notification.kind && item.refId === notification.refId)) return false;
  store.notifications.push(notification);
  return true;
}

export function checkShowtimeSoldOut(store: Store, showtimeId: number): void {
  const showtime = store.showtimes.find(item => item.id === showtimeId);
  if (!showtime) return;
  if (new Date(showtime.startTime).getTime() < Date.now()) return;
  const totalSeats = showtime.seats.length;
  if (totalSeats === 0) return;
  const reserved = showtime.seats.filter(seat => seat.status === "Reserved").length;
  if (reserved < totalSeats) return;
  const movie = store.movies.find(item => item.id === showtime.movieId);
  const title = movie?.title ?? "A movie";
  const when = formatClock(showtime.startTime);
  pushNotification(store, {
    id: randomUUID(),
    userId: ADMIN_NOTIFICATION_USER,
    role: "admin",
    kind: "sold-out",
    title: "Auditorium sold out",
    message: `${title} · ${when} in ${showtime.auditorium} is fully booked. Consider adding a new showtime.`,
    refId: showtime.id,
    createdAt: new Date().toISOString(),
    readAt: null
  });
  for (const [userId, ids] of Object.entries(store.watchlists ?? {})) {
    if (!ids.includes(showtime.movieId)) continue;
    pushNotification(store, {
      id: randomUUID(),
      userId,
      role: "customer",
      kind: "watchlist-sold-out",
      title: `${title} sold out`,
      message: `The ${when} show of ${title} in ${showtime.auditorium} just sold out. Grab another showtime quickly!`,
      refId: showtime.id,
      createdAt: new Date().toISOString(),
      readAt: null
    });
  }
}

export function notifyMovieNowShowing(store: Store, movieId: number): void {
  const movie = store.movies.find(item => item.id === movieId);
  if (!movie) return;
  for (const [userId, ids] of Object.entries(store.watchlists ?? {})) {
    if (!ids.includes(movieId)) continue;
    pushNotification(store, {
      id: randomUUID(),
      userId,
      role: "customer",
      kind: "now-showing",
      title: `${movie.title} is now showing`,
      message: `One of your saved films just opened. Book your seats today.`,
      refId: movieId,
      createdAt: new Date().toISOString(),
      readAt: null
    });
  }
}

export function mine(store: Store, user: { id: string; role: "admin" | "customer" }): Notification[] {
  const list = (store.notifications ?? []).filter(item => item.role === "admin" ? user.role === "admin" : item.userId === user.id);
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}