import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  value: string;
  size?: number;
  label?: string;
};

const FALLBACK =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#121b26"/><text x="60" y="64" fill="#98a3ac" font-family="sans-serif" font-size="10" text-anchor="middle">Code unavailable</text></svg>`
  );

/**
 * Renders a genuinely scannable QR code. `qrcode` is a browser-safe library, so
 * the SVG is generated on the client and there is no image round-trip.
 */
export function QrTicket({ value, size = 220, label }: Props) {
  const [src, setSrc] = useState(FALLBACK);

  useEffect(() => {
    let active = true;
    // The encoder rejects an empty string; fall back rather than render nothing.
    if (!value) {
      setSrc(FALLBACK);
      return;
    }
    QRCode.toString(value, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: size,
      color: { dark: "#0b1018", light: "#ffffff" }
    })
      .then(svg => {
        if (active) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (active) setSrc(FALLBACK);
      });
    return () => { active = false; };
  }, [value, size]);

  return (
    <img
      className="ticket-qr"
      src={src}
      width={size}
      height={size}
      alt={label ?? `QR ticket code ${value}`}
      role="img"
    />
  );
}