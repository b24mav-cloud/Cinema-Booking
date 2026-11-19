# Project Memory

## What this project is

CinemaBooking is a cinema ticket booking web app built with Next.js 15, React 19, TypeScript, and Bootstrap 5. It uses the Next.js **Pages Router**. Customers browse films and showtimes, select seats and add-ons, and receive QR tickets. Admins manage movies, showtimes, auditoriums, seat maps, bookings, and reports.

Visual identity: **Baroque**. Dramatic contrast, deep crimson, gold leaf, and midnight black, with theatrical lighting. The cinema is treated as a grand theatre. See "Design system" below.

## Main areas

- `pages/`: customer pages, admin pages, and API routes under `pages/api/`.
- `components/`: shared UI; `components/booking/` contains the booking wizard, seat map/grid, order summary, and confirmation panel.
- `lib/types.ts`: shared domain types for movies, auditoriums, seats, showtimes, bookings, holds, users, and notifications.
- `lib/api/`: server-side auth, data store, booking operations, API response helpers, rate limiting, notifications, and synchronization.
- `lib/booking.ts` and `lib/useBookingFlow.ts`: shared booking calculations and client-side booking flow.
- `public/styles.css`: global Baroque theme (design tokens, Bootstrap variable overrides, ornamental utilities), imported with Bootstrap in `pages/_app.tsx`.
- `data/cinema.json`: local persistent fallback store; `scripts/` contains seed and KV migration utilities.

## Data and configuration

`lib/api/store.ts` owns the store lifecycle and normalization. It reads/writes the single KV key `cinema:store` when `KV_REST_API_URL` and `KV_REST_API_TOKEN` are configured. Otherwise it uses `data/cinema.json` locally, then in-memory state if the file is unavailable (such as a read-only serverless filesystem). In-memory serverless writes are not durable or shared across instances.

Supabase Auth is configured with `SUPABASE_URL` and `SUPABASE_ANON_KEY`; the optional `SUPABASE_SERVICE_ROLE_KEY` is server-only and used by privileged seed/admin operations. Never expose or commit secrets. `.env.example` documents expected variables. Local secrets belong in ignored `.env` / `.env.local` files.

Sessions use an HttpOnly, Secure, SameSite=Lax `cinema_session` cookie. Admin sessions have a 20-minute idle lifetime; customer sessions have a 30-day lifetime. Admin role must come from trusted Supabase `app_metadata`, never editable `user_metadata`.

## Important behavior and invariants

- Booking requests are validated and totals are recomputed server-side; clients should not be trusted for seat prices or add-on prices.
- A booking may contain at most 8 seats. Temporary seat holds expire after 8 minutes; holds prevent concurrent checkouts from claiming the same seats.
- Cancellation is allowed only more than 2 hours before showtime (see `CANCELLATION_CUTOFF_MS` in `lib/api/store.ts`).
- Seat identity for booking snapshots and seat-map migration is the physical `row` + `number`, not a generated seat ID. Map edits regenerate IDs and preserve reservation status/prices by row ordinal where possible.
- Regular auditorium geometry is rows A–I with three sections (4 + 10 + 4 seats); VIP is rows A–D with four paired recliner sections. Treat geometry in `lib/api/store.ts` as data, not UI markup.
- Only seats with status `Available` can be booked. Maintenance/Closed auditoriums should not be offered for public booking; server routes enforce this as well.
- Booking and hold mutations go through `mutateStore` in `lib/api/store.ts`, which serializes updates using the store lock. Preserve that path for writes to avoid lost updates.
- Admin API routes should use `requireUser(req, res, "admin")`; customer ownership checks belong on account/booking operations.

## Useful routes

- Public/customer: `/`, `/movies`, `/movies/[id]`, `/now-showing`, `/book-tickets`, `/account`, `/signin`, `/signup`, `/forgot-password`, `/reset-password`, `/about`.
- Admin: `/admin`, `/admin/auditorium/[id]`, `/admin/checkin`, `/admin/reports`.
- API: `/api/movies`, `/api/showtimes`, `/api/branches`, `/api/addons`, `/api/bookings`, `/api/holds`, `/api/account/*`, `/api/auth/*`, `/api/notifications/*`, and `/api/admin/*`.

## Development commands

- `npm install` — install dependencies.
- `npm run dev` — start local development at `http://localhost:3000`.
- `npm run typecheck` — run `tsc --noEmit`.
- `npm run check:css` — validate CSS constraints; this also runs as part of `npm run build`.
- `npm run build` / `npm run start` — production build and server.
- `npm run seed:dev` — create development Supabase test accounts; explicitly gated by `SEED_DEV=1` and refuses production.
- `npm run seed:showtimes` — seed showtimes.
- `npm run migrate:kv` — normalize and migrate `data/cinema.json` into Vercel KV.

---

## Design system: Baroque

Source: Baroque design spec. This replaces the previous dark cinematic theme. Functional behavior, data, and API logic above are unchanged by the redesign.

### Concept

Baroque is persuasion through contrast: deep shadow against blazing highlight, intimate detail against monumental scale, stillness against motion. In this app that means layered depth, theatrical lighting (radial gradients), ornate gold borders, and compositions that guide the eye through deliberate tension. It is maximalism with a spine: ornament must never get in the way of booking.

- Density 5/10 (balanced), Variance 4/10 (moderate), Motion 4/10 (subtle).
- Keywords: dramatic, ornate, rich, theatrical, gold leaf, opulent, grandeur.
- Light and dark modes both supported in full.

### Design tokens

```yaml
colors:
  primary: "#8B0000"     # Deep Crimson: dominant surface/brand color
  secondary: "#DAA520"   # Royal Gold: premium accents, borders, highlights
  tertiary: "#0D0D0D"    # Midnight Black: dark surface, primary background
  neutral: "#FFFFF0"     # Ivory: light surface, card backgrounds, text on dark
  surface: "#4B0082"     # Royal Purple: accent, emphasis elements
  accent: "#046307"      # Emerald: decorative, success/availability
  burnt-sienna: "#E97451"  # extended, decorative
  champagne: "#F7E7CE"     # extended, decorative
typography:
  display: { fontFamily: "Cinzel Decorative", fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 700 }
  h1:      { fontFamily: "Cinzel Decorative", fontSize: "2.25rem", fontWeight: 700 }
  h2:      { fontFamily: "Cinzel Decorative", fontSize: "1.5rem" }
  body:    { fontFamily: "Cinzel Decorative", fontSize: "1rem", lineHeight: 1.6, maxWidth: "72ch" }
  label:   { fontFamily: "Cinzel Decorative", fontSize: "0.875rem", fontWeight: 500, letterSpacing: "slight" }
  mono:    { fontFamily: "JetBrains Mono" }   # code, metadata, technical values, booking references
spacing: { sm: 2.0rem, md: 4.0rem, lg: 8.0rem }   # base unit 0.5rem (8px)
radius: { base: 8px }
```

Colors: Midnight Black is the primary dark background; Ivory is the light surface. Never use pure `#000000`; use `#0D0D0D` or charcoal variants. Keep accent saturation at or below 80%.

### Typography

- Cinzel Decorative for display, headings, body, and labels. Load via `next/font/google` (or `pages/_document.tsx`) rather than a render-blocking `@import`. JetBrains Mono for monospace.
- Body copy max line length 72ch.

### Layout

- CSS Grid primary. Max-width 1280px, centered, 1.5rem side padding.
- Section vertical gaps: `clamp(4rem, 8vw, 8rem)`.
- Home/hero: split-screen (text left, visual right).
- Feature/marketing sections: zig-zag alternating text and image rows. No 3-equal-column feature layouts; use zig-zag or asymmetric grids.
- Mobile: all multi-column layouts collapse below 768px; no horizontal overflow.
- z-index contract: base 0 / sticky-nav 100 / overlay 200 / modal 300 / toast 500.
- Use `min-height: 100dvh`, never `100vh` / `h-screen`.
- **Exempt from layout rules:** the seat map/grid, order summary, and admin tables. These follow the geometry and data invariants above (e.g. 4 + 10 + 4 sections), not marketing-layout rules. Seat sections may scroll horizontally inside their own container on small screens, but the page itself must not overflow.

### Elevation, depth, and motion

- Heavy ornamental borders, gold-leaf textures, dramatic shadow gradients, rich layered backgrounds, theatrical radial-gradient lighting (e.g. a warm spotlight behind the screen and hero).
- Easing: ease-out, 200-300ms. Hover: subtle color shift and shadow change over 200ms.
- Entry: fade + translate-Y (16px to 0) over 420ms ease-out; list cascades stagger 80ms per item.
- Page transitions: fade only, 200ms.
- Animate only `transform` and `opacity`. No layout-triggering properties.
- Respect `prefers-reduced-motion`.

### Components

- **Primary button:** 0.5rem radius, crimson fill with ivory text, padding 12px, weight 600. Hover: 8% darken + subtle lift shadow. Active: -1px translate. No outer glows.
- **Secondary/ghost button:** 1.5px outline in muted color, primary-colored text, subtle fill on hover.
- **Cards (movie, showtime, add-on):** 0.5rem radius, surface background, shadow `0 2px 12px rgba(0,0,0,0.06)`, 1px border; gold ornamental border treatment on featured cards.
- **Inputs:** label above input, 1px border, focus ring 2px accent offset 2px, error text below in semantic red. No floating labels.
- **Navigation:** primary (crimson) surface; active item marked with accent indicator, weight 500.
- **Skeletons:** shimmer matching component dimensions. No circular spinners.
- **Empty states:** icon + descriptive text + action button.
- **Icons:** icon system only (Lucide or Heroicons). No emojis in the UI.

### Mapping the palette onto booking UI

Use these defaults for the booking and admin screens, and keep status meaning independent of color alone (also use shape, icon, or label so it stays accessible):

- Seat `Available`: emerald outline/fill. Selected: gold. Held (8-minute hold by another customer): purple. Reserved/Unavailable: muted charcoal. Maintenance/Closed: crimson-tinted hatched.
- Confirmation panel and QR ticket: ivory card with gold ornamental border; booking reference in JetBrains Mono.
- Admin screens: same palette and type, but reduce ornament and keep density high (tables, forms, reports stay legible first).

### Bootstrap 5 integration

- Bootstrap stays in place. Apply the Baroque theme by overriding Bootstrap CSS variables (`--bs-primary`, `--bs-body-bg`, `--bs-body-color`, `--bs-border-color`, `--bs-body-font-family`, etc.) in `public/styles.css`, not by forking Bootstrap.
- Define the design tokens as CSS custom properties on `:root` with a dark default and light-mode overrides.
- Any new CSS must still pass `npm run check:css`.

### Do's and don'ts

Do:
- Rich deep palette, ornate gold borders and accents, dramatic lighting via gradients.
- Serif typography with flourishes; theatrical light/dark contrast.
- Responsive ornamental layouts.

Don't:
- No emojis in the UI; no pure black (`#000000`); no oversaturated accents (saturation cap 80%).
- No 3-equal-column feature layouts; no `h-screen`.
- No AI copy clichés ("Elevate", "Seamless", "Unleash", "Next-Gen").
- No broken external image links; use local assets, `picsum.photos`, or inline SVG for placeholders.
- No generic lorem ipsum in demos; use real cinema copy (film titles, showtimes, auditorium names).
- No decoration that reduces seat-map clarity, contrast, or tap-target size.

---

## Change guidance

- Keep browser-safe modules separate from Node-only code. In particular, do not import `lib/api/bookings.ts` into client components if it pulls in `node:crypto`; browser-shared booking logic belongs in `lib/booking.ts`.
- API handlers are typed Next.js Pages Router handlers. Reuse helpers in `lib/api/` for auth, JSON responses, and mutations.
- When changing seat geometry or auditorium templates, account for existing showtime seats and reservations; the store has normalization/migration logic for older data.
- Styling and redesign work is presentation only: it must not change store logic, booking invariants, seat identity (`row` + `number`), pricing, hold timing, or auth behavior. Seat geometry stays data in `lib/api/store.ts`, not UI markup.
- New UI should use the Baroque tokens in `public/styles.css` rather than hard-coded colors, fonts, or radii.
- `README.md` is the longer user-facing setup and feature guide. Update it when setup, scripts, or major user-visible flows change (including a visual redesign).
