import type { Seat, SeatSection } from "./types";

/**
 * Seat-map layout engine.
 *
 * Pure and framework-free on purpose: the customer seat picker, the admin seat
 * editor and the occupancy mini-map all render from this, so the row/section
 * maths and the quick-pick heuristic exist in exactly one place.
 */

export type SectionLayout = {
  id: string;
  label: string;
  kind?: "pair";
  seats: Seat[];
};

export type RowLayout = {
  row: string;
  sections: SectionLayout[];
};

export type SeatLayout = {
  type: "regular" | "vip";
  rows: RowLayout[];
  /** Section order shared by every row, for the labels above the map. */
  sections: SectionLayout[];
  totalSeats: number;
  freeSeats: number;
};

export const seatCode = (seat: Seat): string => `${seat.row}${seat.number}`;

export const isTaken = (seat: Seat): boolean => seat.status !== "Available";

/** "pair-1" -> "Pair 1", "middle" -> "Middle". */
function labelFor(id: string): string {
  const words = id.replace(/[-_]+/g, " ").trim();
  return words.replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

/**
 * The sections to group by.
 *
 * Declared metadata wins. Failing that, the sections are inferred from the
 * `sectionId` the seats already carry, in the order they appear left to right in
 * the first row. Inference matters: without it a hall of tagged seats renders as
 * one contiguous block - no aisles, no section labels, no VIP pairs, and quick
 * pick can no longer prefer the middle.
 *
 * A VIP section holding exactly two recliners is treated as a sold-together
 * pair, which is what enables the "Select pair" shortcut.
 */
function sectionsOf(type: "regular" | "vip", seats: Seat[], declared?: SeatSection[]): SeatSection[] {
  if (declared?.length) return declared;

  const firstRow = [...seats].sort((a, b) => a.number - b.number)[0]?.row;
  const ordered: string[] = [];
  const sizeOf = new Map<string, number>();
  for (const seat of seats) {
    if (!seat.sectionId) continue;
    if (seat.row === firstRow && !sizeOf.has(seat.sectionId)) ordered.push(seat.sectionId);
    sizeOf.set(seat.sectionId, (sizeOf.get(seat.sectionId) ?? 0) + 1);
  }
  if (ordered.length > 1) {
    // Seats per row for a section, derived from its total across the hall.
    const rows = Math.max(1, new Set(seats.map(seat => seat.row)).size);
    return ordered.map(id => {
      const perRow = (sizeOf.get(id) ?? 1) / rows;
      return {
        id,
        label: labelFor(id),
        seatCount: perRow,
        ...(type === "vip" && perRow === 2 ? { kind: "pair" as const } : {})
      };
    });
  }
  // Untagged seats: one section, which `buildSeatLayout` renders as a single run.
  return type === "vip" ? [{ id: "seats", label: "Recliners", seatCount: 0 }] : [{ id: "seats", label: "Seats", seatCount: 0 }];
}

/**
 * Groups seats into rows front-to-back, then into sections left-to-right.
 *
 * Row order follows `auditorium.rows` when supplied so a hall is not silently
 * re-sorted alphabetically, and seat order inside a section follows the seat
 * number so a row always reads 1..n left to right.
 */
export function buildSeatLayout(seats: Seat[], type: "regular" | "vip", declared?: SeatSection[], rowOrder?: string[]): SeatLayout {
  const byRow = new Map<string, Seat[]>();
  for (const seat of seats) {
    const list = byRow.get(seat.row) ?? [];
    list.push(seat);
    byRow.set(seat.row, list);
  }
  for (const list of byRow.values()) list.sort((a, b) => a.number - b.number);

  const seen = new Set(byRow.keys());
  const orderedRows = [...(rowOrder ?? []).filter(row => seen.has(row)), ...[...seen].sort()];
  const sections = sectionsOf(type, seats, declared);

  const rows: RowLayout[] = orderedRows.map(row => {
    const rowSeats = byRow.get(row)!;
    const layoutSections: SectionLayout[] = [];
    for (const section of sections) {
      const inSection = section.seatCount
        ? rowSeats.filter(seat => seat.sectionId === section.id)
        : // No section metadata: fall back to a single run of every seat.
          rowSeats;
      if (inSection.length) {
        layoutSections.push({ id: section.id, label: section.label, kind: section.kind, seats: inSection });
      }
    }
    return { row, sections: layoutSections };
  });

  return {
    type,
    rows,
    sections: sections
      .map(declaredSection => rows[0]?.sections.find(section => section.id === declaredSection.id))
      .filter((section): section is SectionLayout => Boolean(section)),
    totalSeats: seats.length,
    freeSeats: seats.filter(seat => !isTaken(seat)).length
  };
}

/** Maximal runs of free seats inside one section. An aisle or a taken seat ends a run. */
export function freeRuns(section: SectionLayout): Seat[][] {
  const runs: Seat[][] = [];
  let run: Seat[] = [];
  for (const seat of section.seats) {
    if (isTaken(seat)) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    run.push(seat);
  }
  if (run.length) runs.push(run);
  return runs;
}

/** Middle section first, then the wings. Unknown sections sort last. */
const SECTION_RANK: Record<string, number> = { middle: 0, left: 1, right: 2 };

/**
 * Rows a regular cinema would offer first: E and F are the classic sweet spot,
 * then outwards. Compared by index rather than by letter so the same ranking
 * cannot accidentally apply to a hall whose rows do not start at A.
 */
const ROW_PREFERENCE = ["E", "F", "D", "G", "C", "H", "B", "I", "A"];

function rowRank(row: string): number {
  const index = ROW_PREFERENCE.indexOf(row);
  return index < 0 ? ROW_PREFERENCE.length : index;
}

/**
 * Best block of `count` adjacent seats inside a single section.
 *
 * The row rank is weighted an order of magnitude above the section and centring
 * terms on purpose. The previous heuristic mixed an absolute column offset into
 * the same score as the row distance, so once a hall got wide the column term
 * outvoted "prefer the middle rows" entirely.
 *
 * Returns `null` when nothing fits, which the caller turns into a message rather
 * than silently doing nothing.
 */
export function suggestSeats(layout: SeatLayout, count: number): number[] | null {
  if (count < 1 || !layout.rows.length) return null;
  // An array holder rather than a `let`: TypeScript keeps the narrowed type of a
  // variable assigned only inside a closure, and would read `best` as `null`.
  const best: { ids: number[]; score: number }[] = [];
  const consider = (ids: number[], score: number) => {
    if (!best.length || score < best[0].score) best[0] = { ids, score };
  };

  // A VIP row is a row of pairs, and a pair section is only ever two seats, so a
  // single-section run can never satisfy 4. Build the run from adjacent *pairs*
  // instead, which is also the shape a four-seat booking should take.
  if (layout.type === "vip" && count >= 2 && count % 2 === 0) {
    for (const row of layout.rows) {
      const freePairs = row.sections.filter(section => pairSeatIds(section) !== null);
      for (let start = 0; start + count / 2 <= freePairs.length; start++) {
        const window = freePairs.slice(start, start + count / 2);
        const ids = window.flatMap(section => section.seats.map(seat => seat.id));
        const centring = Math.abs(start + count / 4 - freePairs.length / 2);
        consider(ids, rowRank(row.row) * 100 + centring);
      }
    }
    if (best.length) return best[0].ids;
  }

  for (const row of layout.rows) {
    for (const section of row.sections) {
      for (const run of freeRuns(section)) {
        if (run.length < count) continue;
        for (let start = 0; start + count <= run.length; start++) {
          const window = run.slice(start, start + count);
          const centring = Math.abs(start + count / 2 - run.length / 2);
          consider(window.map(seat => seat.id), rowRank(row.row) * 100 + (SECTION_RANK[section.id] ?? 3) * 10 + centring);
        }
      }
    }
  }

  return best.length ? best[0].ids : null;
}

/**
 * Both recliners in one VIP pair, for the "Select pair" shortcut. Returns
 * `null` when the pair is not fully free.
 */
export function pairSeatIds(section: SectionLayout): number[] | null {
  if (section.kind !== "pair" || section.seats.length !== 2) return null;
  return section.seats.every(seat => !isTaken(seat)) ? section.seats.map(seat => seat.id) : null;
}

/** Flat seat order for arrow-key movement: row by row, left to right. */
export function seatsInOrder(layout: SeatLayout): Seat[] {
  return layout.rows.flatMap(row => row.sections.flatMap(section => section.seats));
}