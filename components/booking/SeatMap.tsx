import { useEffect, useMemo, useRef, useState } from "react";
import type { Seat } from "../../lib/types";
import { peso } from "../../lib/types";
import { MAX_SEATS } from "../../lib/useBookingFlow";
import { buildSeatLayout, seatCode, suggestSeats } from "../../lib/seatLayout";
import { SeatGrid } from "./SeatGrid";

type Props = {
  seats: Seat[];
  selected: number[];
  isVip: boolean;
  disabled?: boolean;
  auditoriumName?: string;
  onToggle: (seatId: number) => void;
  onSelectSeats: (seatIds: number[]) => void;
  onContinue: () => void;
};

const QUICK_PICK_COUNTS = [1, 2, 3, 4];

/**
 * The screen arc is drawn to the measured width of the seat block rather than to
 * a percentage, because `preserveAspectRatio="none"` would otherwise stretch the
 * curve and thin the stroke. `non-scaling-stroke` keeps it 4px even in the first
 * frame, before the measurement lands.
 */
const SCREEN_ARC_HEIGHT = 26;

export function SeatMap({ seats, selected, isVip, disabled, auditoriumName, onToggle, onSelectSeats, onContinue }: Props) {
  const layout = useMemo(() => buildSeatLayout(seats, isVip ? "vip" : "regular"), [seats, isVip]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const chosenSeats = useMemo(() => seats.filter(seat => selectedSet.has(seat.id)), [seats, selectedSet]);
  const total = chosenSeats.reduce((sum, seat) => sum + seat.price, 0);

  const [quickMessage, setQuickMessage] = useState("");
  const [blockWidth, setBlockWidth] = useState(0);
  const [overflows, setOverflows] = useState(false);

  const blockRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Measure after render: the screen must span the seat block, and the block's
  // width depends on the data, the breakpoint and the font metrics.
  useEffect(() => {
    const block = blockRef.current;
    const scroll = scrollRef.current;
    if (!block || !scroll) return;
    const update = () => {
      setBlockWidth(Math.round(block.getBoundingClientRect().width));
      setOverflows(scroll.scrollWidth > scroll.clientWidth + 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(block);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [layout]);

  const runSuggestion = (count: number) => {
    const ids = suggestSeats(layout, count);
    if (!ids) {
      // A VIP pair is sold whole, so an odd count above one can never be filled
      // by quick pick. Say that rather than reporting a generic shortage.
      setQuickMessage(
        isVip && count > 1 && count % 2 === 1
          ? "VIP recliners are sold as pairs. Quick pick 2 or 4, or choose individual recliners."
          : `No run of ${count} adjacent ${count === 1 ? "seat is" : "seats are"} free in one section. Try fewer, or pick them yourself.`
      );
      return;
    }
    setQuickMessage("");
    onSelectSeats(ids);
  };

  const selectPair = (ids: number[]) => {
    setQuickMessage("");
    onSelectSeats(ids);
  };

  const atLimit = selected.length >= MAX_SEATS;
  const chosen = chosenSeats.map(seatCode);

  return (
    <div className={`seat-picker${isVip ? " vip" : ""}`}>
      <div className="seat-picker-toolbar">
        <ul className="seat-legend">
          <li><span className="legend-swatch legend-available" aria-hidden="true" />Available</li>
          <li><span className="legend-swatch legend-selected" aria-hidden="true" />Your seats</li>
          <li><span className="legend-swatch legend-taken" aria-hidden="true" />Taken</li>
          {isVip ? <li><span className="legend-swatch legend-pair" aria-hidden="true" />Recliner pair</li> : null}
        </ul>
        <div className="seat-quickpick">
          <span className="seat-quickpick-label">Quick pick</span>
          {QUICK_PICK_COUNTS.map(count => (
            <button type="button" key={count} className="chip-button" disabled={disabled} onClick={() => runSuggestion(count)}>
              {count} {count === 1 ? "seat" : "seats"}
            </button>
          ))}
        </div>
      </div>

      <p className="seat-quickpick-message" role="status" aria-live="polite">
        {quickMessage}
      </p>

      <div className="seat-map-scroll" ref={scrollRef}>
        <div className="seat-screen">
          <svg
            className="seat-screen-curve"
            width={blockWidth || undefined}
            height={SCREEN_ARC_HEIGHT}
            viewBox={`0 0 ${blockWidth || 320} ${SCREEN_ARC_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d={`M0 3 Q ${(blockWidth || 320) / 2} ${SCREEN_ARC_HEIGHT} ${blockWidth || 320} 3`}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="seat-screen-label">Screen</span>
        </div>

        {/* Section labels mirror the row template exactly, so each label spans
            its own section and the two stay registered as columns resize. */}
        <div className="seat-section-head" aria-hidden="true">
          <span className="seat-row-letter" />
          {layout.sections.map((section, index) => (
            <span className="seat-section-slot" key={section.id}>
              <span className="seat-section-label">{section.label}</span>
              {index < layout.sections.length - 1 ? <span className="seat-aisle" /> : null}
            </span>
          ))}
          <span className="seat-row-letter" />
          <span className="seat-row-letter seat-row-letter-end" />
        </div>

        <div className="seat-block" ref={blockRef}>
          <SeatGrid
            layout={layout}
            selected={selected}
            disabled={disabled}
            onToggle={onToggle}
            onSelectMany={isVip ? selectPair : undefined}
          />
        </div>
      </div>

      {overflows ? <p className="seat-scroll-hint">Scroll sideways to see every seat</p> : null}

      <p className="seat-availability" role="status" aria-live="polite">
        {layout.freeSeats} of {layout.totalSeats} seats free{auditoriumName ? ` · ${auditoriumName}` : ""}
      </p>

      {atLimit ? <p className="seat-limit">Maximum {MAX_SEATS} seats per booking. Deselect a seat to change your selection.</p> : null}

      <div className="seat-summary-bar">
        <div className="seat-summary-bar-detail">
          <b>{chosen.length ? chosen.join(", ") : "No seats selected"}</b>
          <span>
            {chosen.length
              ? `${chosen.length} ${chosen.length === 1 ? "seat" : "seats"} · ${peso(total)}`
              : "Pick at least one seat to continue."}
          </span>
        </div>
        <button type="button" className="button gold-button seat-summary-bar-continue" disabled={disabled || !chosen.length} onClick={onContinue}>
          Continue →
        </button>
      </div>
    </div>
  );
}