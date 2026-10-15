const VIDEO_ID = /^[\w-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** Paths whose next segment is the video ID, e.g. /shorts/<id>. */
const ID_PATH_PREFIXES = new Set(["embed", "shorts", "live", "v", "e"]);

export type ParsedYouTubeUrl = {
  videoId: string;
  /** From a `t=` or `start=` parameter; 0 when absent. */
  startSeconds: number;
};

function toUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    // Accept links pasted without a scheme, like "youtu.be/abc".
    return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

/** "90", "90s", "1m30s" and "1h2m3s" all mean a number of seconds. */
export function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match[0]) return 0;
  const [, h = "0", m = "0", sec = "0"] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(sec);
}

/** Read the video ID and start time from any YouTube link; null for anything else. */
export function parseYouTubeUrl(input: string): ParsedYouTubeUrl | null {
  const url = toUrl(input);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) return null;

  let videoId: string | null = null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be" || host === "www.youtu.be") {
    videoId = segments[0] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (segments[0] === "watch") {
      videoId = url.searchParams.get("v");
    } else if (segments[0] && ID_PATH_PREFIXES.has(segments[0])) {
      videoId = segments[1] ?? null;
    }
  }

  if (!videoId || !VIDEO_ID.test(videoId)) return null;

  const hashTime = new URLSearchParams(url.hash.slice(1)).get("t");
  const startSeconds = parseTimestamp(
    url.searchParams.get("t") ?? url.searchParams.get("start") ?? hashTime,
  );
  return { videoId, startSeconds };
}

export function extractYouTubeId(url: string): string | null {
  return parseYouTubeUrl(url)?.videoId ?? null;
}

/** The plain watch link, without playlist, tracking or timestamp parameters. */
export function buildYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function buildYouTubeEmbedUrl(videoId: string, startSeconds = 0): string {
  const start = Number.isFinite(startSeconds) ? Math.max(0, Math.floor(startSeconds)) : 0;
  const startParam = start > 0 ? `&start=${start}` : "";
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1&autoplay=1&enablejsapi=1${startParam}`;
}

export function buildYouTubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
