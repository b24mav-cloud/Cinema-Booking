# CinemaBooking

A cinema booking system built with **Next.js, TypeScript, and Bootstrap**.

## Stack

- **Next.js 15** (pages router) + React 19
- **TypeScript** throughout the frontend, API routes, and data layer
- **Bootstrap 5** (global CSS) plus a custom dark cinematic theme
- **Supabase** for authentication (email/password)
- **Vercel KV** (Upstash Redis) for data; falls back to a local JSON file or in-memory

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

For authentication, copy `.env.example` to `.env` and fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` is optional and server-only — never expose it to the browser or commit it.

Sign in, sign up, and password reset all live in `pages/*.tsx` + `pages/api/auth/*`, backed by Supabase Auth (bcrypt-hashed passwords server-side). Sessions use an `HttpOnly; Secure; SameSite=Lax` cookie; admin sessions idle out after 20 minutes, customer sessions after 30 days.

### Development test accounts

Seed the dev accounts with the service-role key (requires `SEED_DEV=1` in a gitignored `.env.local`):

```bash
npm run seed:dev
```

This creates:

- Customer `customer.test@example.com` / `CinemaTest!2026`
- Admin `admin.test@example.com` / `CinemaAdmin!2026`

The seed is gated behind the explicit command and refuses to run with `NODE_ENV=production`. Passwords are hashed by Supabase server-side, same as real sign-ups. Credentials live in gitignored `.env.local` and are never committed.

## Scripts

- `npm run dev` — start the development server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run seed:dev` — create dev test accounts in Supabase (dev only)
- `npm run typecheck` — run `tsc --noEmit`

## Structure

- `pages/` — pages and typed API routes (`/api/*`)
- `components/` — shared React components (`SiteHeader`)
- `lib/types.ts` — shared domain types and the add-ons catalog
- `lib/api/` — data store (Vercel KV / JSON / memory), Supabase auth, and route helpers
- `public/styles.css` — the site theme (imported globally in `pages/_app.tsx`)

## API

All handlers live in `pages/api/` and are fully typed. Routes:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/auth/me` | Current session |
| POST | `/api/auth/signin` | Sign in via Supabase |
| POST | `/api/auth/signout` | Sign out |
| GET | `/api/account` | Current customer's bookings |
| GET | `/api/admin/dashboard` | Admin stats |
| GET/POST | `/api/admin/movies` | Admin movie management |
| PATCH | `/api/admin/movies/:id` | Update/archive a movie |
| GET/PATCH | `/api/admin/auditoriums/:id` | Auditorium detail, status, and seat map |
| GET | `/api/branches` | List branches |
| GET | `/api/movies`·`/api/movies/:id` | Public movie list/detail |
| GET | `/api/showtimes`·`/api/showtimes/:id` | Public showtime list/detail |
| POST | `/api/showtimes` | Create a showtime |
| POST | `/api/bookings` | Create a booking |
| GET | `/api/bookings/:id` | Get a booking |
| POST | `/api/bookings/:id/confirm` | Confirm a booking |

Admin-only rows require a signed-in admin session (`/api/admin/*`). Public
movie/showtime routes hide showtimes whose auditorium is `Maintenance` or
`Closed`, and booking a showtime in one returns `409`.

## Admin dashboard and seat maps

Sign in as an admin and open **/admin** for the dashboard: live stats, an
auditorium grid (switch `Open` / `Maintenance` / `Closed` and save), and full
movie management — add, edit, poster upload (image data-URI up to ~1.5MB), and
archive.

Each auditorium has a **seat map editor** at `/admin/auditorium/:id`. Regular
halls start at 30 seats (3 rows × 10), the VIP Lounge at 12 recliners
(2 rows × 6). Edit one map and **Save** — every showtime scheduled in that
auditorium mirrors it automatically: reserved seats and their prices are
preserved, everything else follows the template. Public booking treats any
non-`Available` seat (reserved or out of service) as unbookable.

The front-page **hero carousel** is a coverflow-style gallery (now showing
first, then coming soon). It supports drag/swipe with momentum, arrow/dot
controls, keyboard navigation, hover-pausing autoplay, and falls back to a
quiet crossfade with no autoplay under `prefers-reduced-motion`.

## Data

The data layer uses **Vercel KV** (Upstash Redis) when `KV_REST_API_URL` and
`KV_REST_API_TOKEN` are configured; set them in the Vercel project environment
**and** your gitignored `.env.local` so local dev and the deployed site share the
same durable store. Without those credentials the store falls back to
`data/cinema.json` locally, or per-instance memory on Vercel's read-only
filesystem (writes are logged, not silent, but are not durable or shared).

### Migrating to Vercel KV

1. Create a KV store: Vercel dashboard → Storage → Create → KV (or
   `vercel kv create`). Add `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the
   project environment and to `.env.local` (see `.env.example`).
2. Push the current local data into KV once:

   ```bash
   npm run migrate:kv
   ```

   The script reads `data/cinema.json`, removes duplicate/legacy records,
   normalizes movies/auditoriums/showtimes, and stores the result at
   `cinema:store`. KV is then the source of truth; `data/cinema.json` remains a
   local-only fallback.