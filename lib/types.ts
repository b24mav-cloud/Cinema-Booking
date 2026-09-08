export type SeatStatus = "Available" | "Reserved" | "OutOfService";
export type Seat = { id: number; row: string; number: number; price: number; status: SeatStatus; variant?: "standard" | "recliner" };
export type AuditoriumStatus = "Open" | "Maintenance" | "Closed";
export type Auditorium = { id: number; name: string; type: "regular" | "vip"; status: AuditoriumStatus; seats: Seat[] };
export type Movie = { id: number; title: string; synopsis?: string; description?: string; durationMinutes: number; posterUrl: string; rating?: string; experience?: string; tags?: string[]; basePrice?: number; status?: string; genre?: string; cast?: string; releaseDate?: string | null; archivedAt?: string };
export type MovieWithShowtimes = Movie & { showtimes: Showtime[] };
export type Showtime = { id: number; movieId: number; startTime: string; endTime?: string; auditorium: string; auditoriumId?: number; auditoriumType?: "regular" | "vip"; experience?: string; price?: number; seats: Seat[] };
export type ShowtimeDraft = { key: string; id?: number; auditoriumId?: number; date: string; time: string; errors?: Record<string, string> };
export type ShowtimeWithMovie = Showtime & { movie: Movie | null };
export type AddOn = { id: string; name: string; description: string; price: number; icon: string };
export type AddOnSelection = { id: string; name: string; price: number };
export type SeatSnapshot = { row: string; number: number; price: number };
export type Booking = {
  id: string;
  showtimeId: number;
  customerId: string | null;
  userEmail: string;
  movieTitle: string;
  auditorium: string;
  seatSnapshot: SeatSnapshot[];
  addOns: AddOnSelection[];
  paymentMethod: string;
  totalAmount: number;
  createdAt: string;
  isConfirmed: boolean;
  showtime?: ShowtimeWithMovie;
};
export type Store = {
  branches: string[];
  auditoriums: Auditorium[];
  movies: Movie[];
  showtimes: Showtime[];
  bookings: Booking[];
};
export type AuthUser = { id: string; email: string; role: "admin" | "customer"; metadata?: Record<string, unknown> };
export type Dashboard = {
  moviesCurrentlyShowing: number;
  upcomingMovies: number;
  archivedMovies: number;
  todaysBookings: number;
  auditoriumsOpen: number;
  auditoriumsTotal: number;
  auditoriums: { id: number; name: string; type: "regular" | "vip"; status: AuditoriumStatus; seatCount: number }[];
};
export const addOns: AddOn[] = [
  { id: "popcorn", name: "Classic popcorn", description: "Freshly popped, salted just right", price: 180, icon: "🍿" },
  { id: "combo", name: "Movie night combo", description: "Popcorn + 2 drinks", price: 320, icon: "🥤" },
  { id: "nachos", name: "Loaded nachos", description: "Cheesy, crunchy, shareable", price: 220, icon: "🧀" }
];
export const peso = (amount: number) => `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
