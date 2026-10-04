import { useMemo, useRef } from "react";
import type { Seat } from "../../lib/types";
import { MAX_SEATS } from "../../lib/useBookingFlow";

type Props = {
  seats: Seat[];
  selected: number[];
  isVip: boolean;
  disabled?: boolean;
  onToggle: (seatId: number) => void;
  onSelectSeats: (seatIds: number[]) => void;
};

const seatCode = (seat: Seat) => `${seat.row}${seat.number}`;

/**
 * Picks the run of free seats closest to the middle of the auditorium so the
 * "best available" shortcut matches what a regular cinema would offer.
 */
function suggest(seats: Seat[], count: number): number[] {
  const rows = [...new Set(seats.map(seat => seat.row))].sort();
  if (!rows.length || count < 1) return [];
  const middleRow = rows[Math.floor(rows.length / 2)];
  const ordered = [...rows].sort((a, b) => Math.abs(a.charCodeAt(0) - middleRow.charCodeAt(0)) - Math.abs(b.charCodeAt(0) - middleRow.charCodeAt(0)));

  let best: { ids: number[]; distance: number } | null = null;
  for (const row of ordered) {
    const free = seats.filter(seat => seat.row === row && seat.status === "Available").sort((a, b) => a.number - b.number);
    let run: Seat[] = [];
    const runs: Seat[][] = [];
    for (const seat of free) {
      if (run.length && seat.number !== run[run.length - 1].number + 1) {
        runs.push(run);
        run = [];
      }
      run.push(seat);
    }
    if (run.length) runs.push(run);
    for (const candidate of runs) {
      if (candidate.length < count) continue;
      const window = candidate.slice(0, count);
      const centreOffset = Math.abs(window[0].number + count / 2 - (free[0].number + free.length / 2));
      const distance = ordered.indexOf(row) * 10 + centreOffset;
      if (!best || distance < best.distance) best = { ids: window.map(seat => seat.id), distance };
    }
  }
  return best?.ids ?? [];
}

export function SeatMap({ seats, selected, isVip, disabled, onToggle, onSelectSeats }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const grouped = new Map<string, Seat[]>();
    for (const seat of seats) {
      const list = grouped.get(seat.row) ?? [];
      list.push(seat);
      grouped.set(seat.row, list);
    }
    return [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([row, list]) => ({ row, seats: [...list].sort((a, b) => a.number - b.number) }));
  }, [seats]);

  const freeByRow = rows.map(({ row, seats: list }) => ({ row, count: list.filter(seat => seat.status === "Available").length }));

  // The widest row decides the grid, so a 6-wide auditorium does not inherit the
  // 10 columns the stylesheet used to assume and end up with four dead tracks.
  const columns = Math.max(1, ...rows.map(({ seats: list }) => list.length));

  /**
   * Resolves the quick-pick request here, where the suggestion is computed, and
   * hands the concrete seat ids upward. Previously this only asked "is there a
   * suggestion?" and let the caller pick independently, so the check and the
   * selection could disagree.
   */
  const runSuggestion = (count: number) => {
    const ids = suggest(seats, count);
    if (ids.length) onSelectSeats(ids);
  };

  /** Arrow keys move between seats the way a seat map should behave. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const button = event.currentTarget;
    const all = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>("button.seat:not(:disabled)") ?? []);
    const index = all.indexOf(button);
    if (index < 0) return;
    const perRow = rows[0]?.seats.length ?? 1;
    const target =
      event.key === "ArrowLeft" ? index - 1
      : event.key === "ArrowRight" ? index + 1
      : event.key === "ArrowUp" ? index - perRow
      : event.key === "ArrowDown" ? index + perRow
      : event.key === "Home" ? 0
      : all.length - 1;
    if (target < 0 || target >= all.length) return;
    event.preventDefault();
    all[target].focus();
  };

  return (
    <div className="seat-picker">
      <div className="seat-toolbar">
        <div className="seat-legend" aria-hidden="true">
          <span><i className="legend-swatch available" />Available</span>
          <span><i className="legend-swatch selected" />Your seats</span>
          <span><i className="legend-swatch reserved" />Taken</span>
          {isVip && <span><i className="legend-swatch recliner" />Recliner</span>}
        </div>
        <div className="seat-quickpick">
          <span className="muted">Quick pick</span>
          {[1, 2, 3, 4].map(count => (
            <button type="button" key={count} className="chip-button" disabled={disabled} onClick={() => runSuggestion(count)}>
              {count} {count === 1 ? "seat" : "seats"}
            </button>
          ))}
        </div>
      </div>

      <div className="screen" aria-hidden="true"><span>SCREEN</span></div>

      <div className={`seat-map ${isVip ? "vip" : "regular"}`} style={{ "--seat-cols": columns } as React.CSSProperties} ref={gridRef} role="grid" aria-label="Seat map" aria-rowcount={rows.length}>
        {rows.map(({ row, seats: rowSeats }) => (
          <div className="seat-row" role="row" key={row}>
            <span className="row-label" role="rowheader">{row}</span>
            {rowSeats.map(seat => {
              const taken = seat.status !== "Available";
              const isSelected = selected.includes(seat.id);
              const state = taken ? (seat.status === "OutOfService" ? "not for sale" : "taken") : isSelected ? "selected by you" : "available";
              return (
                <button
                  type="button"
                  role="gridcell"
                  key={seat.id}
                  className={`seat ${seat.status.toLowerCase()}${isSelected ? " selected" : ""}${seat.variant === "recliner" ? " recliner" : ""}`}
                  disabled={disabled || taken}
                  aria-selected={isSelected}
                  aria-label={`Seat ${seatCode(seat)}, ${state}`}
                  title={`Seat ${seatCode(seat)} · ${state}`}
                  onClick={() => onToggle(seat.id)}
                  onKeyDown={onKeyDown}
                >
                  <span aria-hidden="true">{seat.number}</span>
                </button>
              );
            })}
            <span className="row-label" role="rowheader">{row}</span>
          </div>
        ))}
      </div>

      <p className="seat-scroll-hint">Scroll sideways to see every seat</p>

      <p className="seat-availability" role="status" aria-live="polite">
        {freeByRow.map(({ row, count }) => `${row}: ${count}`).join(" · ")}
      </p>

      {selected.length >= MAX_SEATS && <p className="muted seat-limit">Maximum {MAX_SEATS} seats per booking.</p>}
    </div>
  );
}