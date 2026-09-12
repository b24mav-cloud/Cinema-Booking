import { useEffect, useRef, useState } from "react";
import { toEmbeddableTrailer } from "../lib/trailers";

type Props = {
  title: string;
  url: string;
  trigger?: HTMLElement | null;
  onClose: () => void;
};

export function TrailerModal({ title, url, trigger, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [muted, setMuted] = useState(true);
  const base = toEmbeddableTrailer(url);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const focusables = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], iframe") ?? []);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      (trigger ?? previouslyFocused)?.focus();
    };
  }, [onClose, trigger]);

  if (!base) return null;

  const src = `${base}${muted ? "" : "&muted=0"}`;

  return <div className="trailer-scrim" onMouseDown={onClose}>
    <div className="trailer-dialog" role="dialog" aria-modal="true" aria-label={`Trailer for ${title}`} ref={dialogRef} onMouseDown={event => event.stopPropagation()}>
      <div className="trailer-head">
        <span className="trailer-title">{title}</span>
        <button type="button" className="trailer-sound" onClick={() => setMuted(current => !current)}>{muted ? "Sound on" : "Mute"}</button>
        <button type="button" className="trailer-close" ref={closeRef} onClick={onClose} aria-label="Close trailer">✕</button>
      </div>
      <div className="trailer-frame">
        <iframe key={src} src={src} title={`${title} trailer`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      </div>
    </div>
  </div>;
}