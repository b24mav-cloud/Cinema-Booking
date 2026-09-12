const YOUTUBE_PATTERNS = [
  /(?:youtube\.com|youtube-nocookie\.com)\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)([A-Za-z0-9_-]+)/,
  /youtu\.be\/([A-Za-z0-9_-]+)/
];

export const youtubeVideoId = (url: string): string | null => {
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = pattern.exec(url);
    if (match?.[1]) return match[1];
  }
  return null;
};

export const toEmbeddableTrailer = (url: string | null | undefined): string | null => {
  const raw = url?.trim() ?? "";
  if (!raw) return null;
  const videoId = youtubeVideoId(raw);
  if (!videoId) return /^https?:\/\//i.test(raw) ? raw : null;
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&muted=1&playsinline=1&rel=0`;
};

export const isWellFormedUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};