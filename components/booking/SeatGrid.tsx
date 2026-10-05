import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Seat } from "../../lib/types";
import { isTaken, pairSeatIds, seatCode, type SeatLayout } from "../../lib/seatLayout";

export type SeatState = "available" | "selected" | "taken" | "unavailable";

/**
 * State -> class, and mode -> class. These are whole class names on purpose: an
 * inline `seat-${state}` reads the same at runtime but leaves `npm run check:css`
 * unable to tell that `.seat-selected` must exist, which is exactly the bug this
 * table would otherwise reintroduce.
 */
const SEAT_STATE_CLASS: Record<SeatState, string> = {
  available: "seat-available",
  selected: "seat-selected",
  taken: "seat-taken",
  unavailable: "seat-unavailable"
};

const MAP_MODE_CLASS: Record<NonNullable<Props["mode"]>, string> = {
  picker: "seat-map-picker",
  status: "seat-map-status"
};

type Props = {
  layout: SeatLayout;
  selected?: number[];
  disabled?: boolean;
  /**
   * "picker" is the customer seat map: focusable buttons with roving tabindex.
   * "status" renders inert spans for read-only views such as occupancy, where
   * every seat would otherwise be a tab stop.
   */
  mode?: "picker" | "status";
  showNumbers?: boolean;
  seatLabel?: (seat: Seat, state: SeatState) => string;
  seatModifier?: (seat: Seat, state: SeatState) => string;
  onToggle?: (seatId: number) => void;
  onSelectMany?: (seatIds: number[]) => void;
  onActiveSeatChange?: (seatId: number) => void;
};

const stateOf = (seat: Seat, selected: Set<number>): SeatState => {
  if (seat.status === "Reserved") return "taken";
  if (seat.status === "OutOfService") return "unavailable";
  return selected.has(seat.id) ? "selected" : "available";
};

const defaultLabel = (seat: Seat, state: SeatState) => {
  const code = seatCode(seat);
  if (state === "taken") return `Seat ${code}, taken`;
  if (state === "unavailable") return `Seat ${code}, not for sale`;
  if (state === "selected") return `Seat ${code}, selected by you`;
  return `Seat ${code}, available`;
};

const LONG_PRESS_MS = 450;

export function SeatGrid({
  layout,
  selected = [],
  disabled,
  mode = "picker",
  showNumbers = true,
  seatLabel = defaultLabel,
  seatModifier,
  onToggle,
  onSelectMany,
  onActiveSeatChange
}: Props) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const interactive = mode === "picker";

  /** Every seat, row by row, left to right: the order Tab and arrows walk. */
  const ordered = useMemo(() => layout.rows.flatMap(row => row.sections.flatMap(section => section.seats)), [layout]);
  const seatById = useMemo(() => new Map(ordered.map(seat => [seat.id, seat])), [ordered]);

  // Roving tabindex: exactly one seat is in the tab order, so the grid costs one
  // Tab rather than one per seat (162 in a regular hall).
  const firstFree = useMemo(() => ordered.find(seat => !isTaken(seat))?.id ?? ordered[0]?.id, [ordered]);
  const [activeId, setActiveId] = useState<number | undefined>(firstFree);

  useEffect(() => {
    if (activeId !== undefined && seatById.has(activeId)) return;
    setActiveId(firstFree);
  }, [activeId, firstFree, seatById]);

  useEffect(() => {
    if (activeId !== undefined) onActiveSeatChange?.(activeId);
  }, [activeId, onActiveSeatChange]);

  const rowIndexOf = useMemo(() => {
    const map = new Map<number, number>();
    layout.rows.forEach((row, index) => row.sections.forEach(section => section.seats.forEach(seat => map.set(seat.id, index))));
    return map;
  }, [layout]);

  const columnsPerRow = useMemo(() => Math.max(1, ...layout.rows.map(row => row.sections.reduce((sum, section) => sum + section.seats.length, 0))), [layout]);

  /**
   * Arrow keys move by *position in the hall*, not by a flat offset.
   *
   * The old handler stepped the enabled-seat list by `seats-in-row-0`, so as soon
   * as one seat in the first row was taken the vertical keys drifted onto the
   * wrong seat. Up and down now resolve by seat number within the target row,
   * which is also what makes them line up across an aisle.
   */
  const move = useCallback(
    (fromId: number, key: string, wholeMap = false) => {
      const from = seatById.get(fromId);
      if (!from) return;
      const rowIndex = rowIndexOf.get(fromId);
      if (rowIndex === undefined) return;
      const row = layout.rows[rowIndex];
      const rowSeats = row.sections.flatMap(section => section.seats);

      if (key === "Home" || key === "End") {
        // Ctrl+Home/End reaches the whole map; plain Home/End stays in the row.
        const targetRow = wholeMap ? layout.rows[key === "Home" ? 0 : layout.rows.length - 1] : row;
        const targetSeats = targetRow.sections.flatMap(section => section.seats);
        const seat = key === "Home" ? targetSeats[0] : targetSeats[targetSeats.length - 1];
        return seat?.id;
      }
      if (key === "ArrowLeft" || key === "ArrowRight") {
        const at = rowSeats.findIndex(seat => seat.id === fromId);
        return rowSeats[at + (key === "ArrowLeft" ? -1 : 1)]?.id;
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        const target = layout.rows[rowIndex + (key === "ArrowUp" ? -1 : 1)];
        if (!target) return;
        const targetSeats = target.sections.flatMap(section => section.seats);
        return (targetSeats.find(seat => seat.number === from.number) ?? targetSeats[key === "ArrowUp" ? targetSeats.length - 1 : 0])?.id;
      }
      return undefined;
    },
    [layout, rowIndexOf, seatById]
  );

  const gridRef = useRef<HTMLDivElement>(null);

  const focusSeat = useCallback((seatId: number) => {
    setActiveId(seatId);
    const node = gridRef.current?.querySelector<HTMLElement>(`[data-seat-id="${seatId}"]`);
    node?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const seatId = Number((event.currentTarget as HTMLElement).dataset.seatId);
      if (!Number.isFinite(seatId)) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (!isTaken(seatById.get(seatId)!) && !disabled) onToggle?.(seatId);
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      const next = move(seatId, event.key, event.ctrlKey);
      if (next === undefined) return;
      event.preventDefault();
      focusSeat(next);
    },
    [disabled, focusSeat, move, onToggle, seatById]
  );

  /** Long-press selects a VIP pair; pointer type is checked so a mouse click still toggles one seat. */
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startPress = (pairIds: number[] | null) => (event: React.PointerEvent) => {
    if (!pairIds || event.pointerType === "mouse") return;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => onSelectMany?.(pairIds), LONG_PRESS_MS);
  };
  const endPress = () => clearTimeout(pressTimer.current);

  const renderSeat = (seat: Seat) => {
    const state = stateOf(seat, selectedSet);
    const inactive = state === "taken" || state === "unavailable";
    const label = seatLabel(seat, state);
    const modifier = seatModifier?.(seat, state);
    const face = (
      <span className="seat-face" aria-hidden="true">
        {showNumbers ? <span className="seat-number">{seat.number}</span> : null}
        {seat.variant === "recliner" ? <span className="seat-footrest" /> : null}
      </span>
    );

    if (!interactive) {
      return (
        <span
          key={seat.id}
          className={`seat ${SEAT_STATE_CLASS[state]}${seat.variant === "recliner" ? " seat-recliner" : ""}${modifier ? " " + modifier : ""}`}
          data-seat-id={seat.id}
          title={label}
          aria-label={label}
          role="img"
        >
          {face}
        </span>
      );
    }

    return (
      <button
        key={seat.id}
        type="button"
        role="gridcell"
        className={`seat ${SEAT_STATE_CLASS[state]}${seat.variant === "recliner" ? " seat-recliner" : ""}${modifier ? " " + modifier : ""}`}
        data-seat-id={seat.id}
        // Taken seats stay focusable so a screen reader can still reach them and
        // hear "taken"; `disabled` would drop them out of the tab order entirely.
        aria-disabled={inactive || disabled ? true : undefined}
        aria-selected={state === "selected"}
        aria-label={label}
        title={label}
        tabIndex={seat.id === activeId ? 0 : -1}
        onClick={() => !inactive && !disabled && onToggle?.(seat.id)}
        onKeyDown={onKeyDown}
        onFocus={() => setActiveId(seat.id)}
      >
        {face}
      </button>
    );
  };

  return (
    <div
      className={`seat-map ${MAP_MODE_CLASS[mode]}${layout.type === "vip" ? " vip" : ""}`}
      ref={gridRef}
      role={interactive ? "grid" : undefined}
      aria-label={interactive ? `Seat map, ${layout.type === "vip" ? "VIP lounge" : "regular auditorium"}` : undefined}
      aria-rowcount={interactive ? layout.rows.length : undefined}
      aria-colcount={interactive ? columnsPerRow : undefined}
    >
      {layout.rows.map((row, rowIndex) => (
        <div className="seat-row" role={interactive ? "row" : undefined} aria-rowindex={interactive ? rowIndex + 1 : undefined} key={row.row}>
          <span className="seat-row-letter" role={interactive ? "rowheader" : undefined}>
            {row.row}
          </span>
          {row.sections.map((section, sectionIndex) => {
            const pairIds = onSelectMany ? pairSeatIds(section) : null;
            const seats = section.seats.map(renderSeat);
            return (
              <span className="seat-section-slot" role="presentation" key={section.id}>
                <span
                  className={`seat-section${section.kind === "pair" ? " is-pair" : ""}`}
                  role="presentation"
                  // Long-press anywhere on the pair selects it, because the
                  // hover-revealed button is unreachable until hover exists.
                  onPointerDown={section.kind === "pair" ? startPress(pairIds) : undefined}
                  onPointerUp={section.kind === "pair" ? endPress : undefined}
                  onPointerLeave={section.kind === "pair" ? endPress : undefined}
                  onContextMenu={section.kind === "pair" && pairIds ? event => event.preventDefault() : undefined}
                >
                  {section.kind === "pair" ? (
                    <>
                      {/* Absolutely positioned inside the relatively positioned
                          frame: the shortcut must not reflow the row on hover,
                          and the frame bounds it so it cannot escape the map. */}
                      {pairIds && onSelectMany ? (
                        <button
                          type="button"
                          className="seat-pair-select"
                          tabIndex={-1}
                          aria-hidden="true"
                          onClick={event => {
                            event.stopPropagation();
                            onSelectMany(pairIds);
                          }}
                          onPointerDown={startPress(pairIds)}
                          onPointerUp={endPress}
                          onPointerLeave={endPress}
                        >
                          Select pair
                        </button>
                      ) : null}
                      {seats}
                    </>
                  ) : (
                    seats
                  )}
                </span>
                {sectionIndex < row.sections.length - 1 ? <span className="seat-aisle" aria-hidden="true" /> : null}
              </span>
            );
          })}
          <span className="seat-row-letter seat-row-letter-end" aria-hidden="true">
            {row.row}
          </span>
        </div>
      ))}
    </div>
  );
}