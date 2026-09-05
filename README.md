# CinemaBooking (Node.js/Vercel)

The original ASP.NET Core project remains in `CinemaBookingSystem.Api/` (and the
existing `Cinema-Booking/` copy is untouched). The deployable Node.js app uses
the preserved pages in `public/` and serverless routes in `api/index.js`.

Run locally with `npm install` followed by `npm run dev`, then open
`http://localhost:3000`. The API remains compatible with the original routes:
`GET /api/health`, movies, showtimes, and booking create/get/confirm endpoints.

The data layer uses Vercel KV when `KV_REST_API_URL` and `KV_REST_API_TOKEN` are
configured. Without those credentials it seeds and persists `data/cinema.json`
locally; on Vercel's read-only filesystem it falls back to per-instance memory,
so bookings are not durable or shared. Configure KV (or replace `api/store.js`
with another managed database adapter) for production persistence.
