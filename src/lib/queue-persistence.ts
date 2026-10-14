import { mergeHistory, type HistoryEntry, type QueueItem, type QueueState } from "./queue-state";
import { mergeTagSources, normalizeTags } from "./tags";
import { buildYouTubeThumbnailUrl } from "./youtube";

export const STORAGE_KEY = "yt-queue-v1";

const BACKUP_FORMAT = "wateer-backup";
const BACKUP_VERSION = 1;

type Stored = {
  items?: unknown;
  currentId?: unknown;
  tagLibrary?: unknown;
  history?: unknown;
  historyBackfilled?: unknown;
  autoPlayNext?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeItem(raw: unknown, now: number): QueueItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = asString(item["id"]);
  const videoId = asString(item["videoId"]);
  if (!id || !videoId) return null;
  const playback = item["playbackSeconds"];
  const duration = item["duration"];
  const commentCount = item["commentCount"];
  const addedAt = item["addedAt"];
  return {
    id,
    videoId,
    url: asString(item["url"]) ?? `https://www.youtube.com/watch?v=${videoId}`,
    title: asString(item["title"]),
    channelName: asString(item["channelName"]),
    duration: typeof duration === "number" && duration > 0 ? duration : null,
    commentCount: typeof commentCount === "number" && commentCount >= 0 ? commentCount : null,
    thumbnail: asString(item["thumbnail"]) ?? buildYouTubeThumbnailUrl(videoId),
    tags: normalizeTags(item["tags"]),
    watched: item["watched"] === true,
    bookmarked: item["bookmarked"] === true,
    inQueue: item["inQueue"] !== false,
    addedAt: typeof addedAt === "number" ? addedAt : now,
    playbackSeconds: typeof playback === "number" && playback > 0 ? playback : 0,
  };
}

function normalizeHistory(entries: unknown, now: number): HistoryEntry[] {
  if (!Array.isArray(entries)) return [];
  const result: HistoryEntry[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const videoId = asString(entry["videoId"]);
    const url = asString(entry["url"]);
    if (!videoId || !url) continue;
    const addedAt = entry["addedAt"];
    result.push({
      videoId,
      url,
      title: asString(entry["title"]),
      addedAt: typeof addedAt === "number" ? addedAt : now,
    });
  }
  return mergeHistory([], result);
}

/**
 * Read saved state, from localStorage or a backup file. Returns null for anything
 * that isn't Wateer data, so an import can reject the wrong file.
 */
export function parseQueueState(raw: string, now = Date.now()): QueueState | null {
  let parsed: Stored;
  try {
    parsed = JSON.parse(raw) as Stored;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (
    !Array.isArray(parsed.items) &&
    !Array.isArray(parsed.history) &&
    !Array.isArray(parsed.tagLibrary)
  ) {
    return null;
  }

  const seenVideos = new Set<string>();
  const items: QueueItem[] = [];
  for (const raw of Array.isArray(parsed.items) ? parsed.items : []) {
    const item = normalizeItem(raw, now);
    if (!item || seenVideos.has(item.videoId)) continue;
    seenVideos.add(item.videoId);
    items.push(item);
  }

  const storedHistory = normalizeHistory(parsed.history, now);
  // Data from before history existed: seed it with every video already in the app.
  const history =
    parsed.historyBackfilled === true
      ? storedHistory
      : mergeHistory(
          storedHistory,
          items.map(({ videoId, url, title, addedAt }) => ({ videoId, url, title, addedAt })),
        );

  const currentId = asString(parsed.currentId);
  return {
    items,
    currentId: currentId && items.some((i) => i.id === currentId) ? currentId : null,
    tagLibrary: mergeTagSources(
      normalizeTags(parsed.tagLibrary),
      items.flatMap((i) => i.tags),
    ),
    history,
    autoPlayNext: parsed.autoPlayNext === true,
  };
}

export function serializeQueueState(state: QueueState): string {
  return JSON.stringify({ ...state, historyBackfilled: true });
}

/** The same shape as storage, labelled so a backup file is recognisable on its own. */
export function serializeBackup(state: QueueState, now = Date.now()): string {
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date(now).toISOString(),
      ...state,
      historyBackfilled: true,
    },
    null,
    2,
  );
}
