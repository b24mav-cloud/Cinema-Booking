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

## Scripts

- `npm run dev` — start the development server
- `npm run build` — production build
- `npm run start` — serve the production build
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
| GET | `/api/branches` | List branches |
| GET | `/api/movies`·`/api/movies/:id` | Public movie list/detail |
| GET | `/api/showtimes`·`/api/showtimes/:id` | Public showtime list/detail |
| POST | `/api/showtimes` | Create a showtime |
| POST | `/api/bookings` | Create a booking |
| GET | `/api/bookings/:id` | Get a booking |
| POST | `/api/bookings/:id/confirm` | Confirm a booking |

## Data

The data layer uses Vercel KV when `KV_REST_API_URL` and `KV_REST_API_TOKEN` are
configured. Without those credentials it seeds and persists `data/cinema.json`
locally; on Vercel's read-only filesystem it falls back to per-instance memory,
so bookings are not durable or shared. Configure KV (or replace `lib/api/store.ts`
with another managed database adapter) for production persistence.