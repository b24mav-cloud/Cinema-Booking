const GRID = 21;
const BLANK = "white";
const FILLED = "#0b1018";

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = ((h << 5) - h + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function isFinderMarker(row: number, col: number): boolean {
  if (row <= 6 && col <= 6) return true;
  if (row <= 6 && col >= GRID - 7) return true;
  if (row >= GRID - 7 && col <= 6) return true;
  return false;
}

function isFinderFilled(row: number, col: number): boolean {
  const r = row <= 6 ? row : row - (GRID - 7);
  const c = col <= 6 ? col : col - (GRID - 7);
  if (r === 0 || r === 6 || c === 0 || c === 6) return true;
  if (r >= 2 && r <= 4 && c >= 2 && c <= 4) return true;
  return false;
}

function isTiming(row: number, col: number): boolean {
  if (row === 6 && col >= 8 && col <= GRID - 9) return col % 2 === 0;
  if (col === 6 && row >= 8 && row <= GRID - 9) return row % 2 === 0;
  return false;
}

export function qrPlaceholderSvg(seed: string, size = 180): string {
  const rand = mulberry32(hashSeed(seed));
  const cells: string[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (isFinderMarker(row, col) ? isFinderFilled(row, col) : isTiming(row, col) || rand() > 0.5) {
        const x = (col / GRID) * size;
        const y = (row / GRID) * size;
        const w = size / GRID;
        cells.push(`<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="${FILLED}"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${BLANK}"/>${cells.join("")}</svg>`;
}
