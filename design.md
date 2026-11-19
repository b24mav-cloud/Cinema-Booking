# CinemaBooking Design System

## Direction

Use a Baroque inspired identity: dramatic contrast, rich crimson, gold accents, midnight surfaces, theatrical lighting, and restrained ornament. Treat the cinema as a grand theatre. Ornament should guide attention without reducing readability, accessibility, or booking clarity.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| Crimson | `#8B0000` | Primary actions and brand emphasis |
| Royal gold | `#DAA520` | Accent, borders, focus and selected states |
| Midnight | `#0D0D0D` | Dark background |
| Ivory | `#FFFFF0` | Text on dark and light surfaces |
| Royal purple | `#4B0082` | Secondary emphasis |
| Emerald | `#046307` | Available/success states |
| Burnt sienna | `#E97451` | Warm supporting accent |
| Champagne | `#F7E7CE` | Light decorative surface |

Never use pure black. Keep status meaning clear through labels, icons, or shape in addition to color. Dark mode is the default; support light mode through `html[data-theme="light"]` token overrides.

## Type

- Cinzel Decorative for display, headings, body, and labels; load with `next/font`.
- JetBrains Mono for technical values, booking references, and metadata.
- Display scale: `clamp(2.5rem, 5vw, 4rem)`; H1 2.25rem; H2 1.5rem; body 1rem with 1.6 line height.
- Keep body copy within roughly 72 characters per line.

## Layout and motion

- Prefer CSS Grid, a centered maximum width of 1280px, and 1.5rem side padding.
- Use `clamp(4rem, 8vw, 8rem)` section spacing and an 8px base rhythm.
- Marketing hero: copy on the left, visual on the right. Alternate feature rows; avoid equal three-column feature grids.
- Collapse multi-column layouts below 768px. Prevent page-level horizontal overflow.
- Use `min-height: 100dvh`; avoid `100vh` sizing.
- Layer order: base 0, sticky navigation 100, overlay 200, modal 300, toast 500.
- Transitions last 200–300ms with ease-out. Entry motion uses opacity and transform only; honor `prefers-reduced-motion`.

Seat maps, order summaries, and admin tables are functional layout exceptions. Preserve seat map geometry from the data layer, keep tap targets clear, and allow only the seat-map area to scroll horizontally when necessary.

## Components

- Primary action: crimson fill, ivory text, 12px padding, 8px radius, subtle lift/shadow on hover, tactile press on active. No outer glow.
- Secondary action: muted 1.5px outline and subtle hover fill.
- Cards: 8px radius, surface fill, 1px border, subtle shadow; reserve ornate gold borders for featured content.
- Inputs: label above, 1px border, visible 2px focus ring with 2px offset, inline semantic error.
- Navigation: crimson surface and a gold active indicator.
- Skeletons shimmer at final component dimensions; empty states pair an icon with explanatory text and an action.
- Use an icon system; do not use emoji as UI icons.

## Booking palette mapping

- Available seats: emerald; selected: gold; held: purple; reserved/unavailable: muted charcoal.
- Maintenance/closed: crimson tint with a pattern or label.
- Confirmation and QR ticket: ivory surface, gold ornamental border, JetBrains Mono booking reference.
- Admin views share the palette with less ornament and higher information density.

## Bootstrap and implementation

Bootstrap 5 remains in place. Override its CSS variables in `public/styles.css`; do not fork Bootstrap. Keep design tokens as CSS custom properties and use them instead of hard-coded values in new UI. Keep styling changes separate from API, auth, store, pricing, hold, and seat identity behavior. Any new component class must have a matching stylesheet rule and pass `npm run check:css`.

Avoid broken remote image links, generic placeholder copy, pure black, oversaturated accents, and the phrases “Elevate,” “Seamless,” “Unleash,” or “Next-Gen.”
