/**
 * The sync model, kept pure so it can be tested without a network. It translates
 * between the app's QueueState and the rows in supabase/migrations, and decides which
 * rows a local change touches and what the app should show after hearing from the
 * server. See docs/adr/0002-accounts-and-sync.md.
 */
import type { Tables } from "@/lib/database.types";
import type { HistoryEntry, QueueItem, QueueState } from "@/lib/queue-state";
import { DEFAULT_TAG_COLOR, isTagColorId, type QueueTag } from "@/lib/tags";
import { buildYouTubeThumbnailUrl } from "@/lib/youtube";

import { assignPositions } from "./positions";

export type VideoRow = Tables<"videos">;
export type TagRow = Tables<"tags">;
export type VideoTagRow = Tables<"video_tags">;
export type HistoryRow = Tables<"history">;
export type SettingsRow = Tables<"user_settings">;

/** The server's copy of one user's data, as last seen. */
export type RemoteSnapshot = {
  videos: Map<string, VideoRow>;
  /** Keyed by tag id. */
  tags: Map<string, TagRow>;
  /** Keyed by `${video_id}:${tag_id}`. */
  videoTags: Map<string, VideoTagRow>;
  /** Keyed by YouTube video id. */
  history: Map<string, HistoryRow>;
  settings: SettingsRow | null;
};

export function emptySnapshot(): RemoteSnapshot {
  return {
    videos: new Map(),
    tags: new Map(),
    videoTags: new Map(),
    history: new Map(),
    settings: null,
  };
}

/**
 * A row that may need writing, named by what identifies it in the app:
 * `video:<id>`, `tag:<lowercased name>`, `vtag:<video id>:<lowercased tag name>`,
 * `history:<YouTube id>` or `settings`.
 */
export type SyncKey = string;

export const videoKey = (id: string): SyncKey => `video:${id}`;
export const tagKey = (name: string): SyncKey => `tag:${name.trim().toLowerCase()}`;
export const videoTagKey = (videoId: string, tagName: string): SyncKey =>
  `vtag:${videoId}:${tagName.trim().toLowerCase()}`;
export const historyKey = (videoId: string): SyncKey => `history:${videoId}`;
export const SETTINGS_KEY: SyncKey = "settings";

export type ParsedKey =
  | { kind: "video"; id: string }
  | { kind: "tag"; name: string }
  | { kind: "vtag"; videoId: string; name: string }
  | { kind: "history"; videoId: string }
  | { kind: "settings" };

export function parseKey(key: SyncKey): ParsedKey | null {
  if (key === SETTINGS_KEY) return { kind: "settings" };
  const [kind, ...rest] = key.split(":");
  if (kind === "video" && rest[0]) return { kind, id: rest.join(":") };
  if (kind === "tag" && rest.length) return { kind, name: rest.join(":") };
  if (kind === "history" && rest[0]) return { kind, videoId: rest.join(":") };
  if (kind === "vtag" && rest.length >= 2) {
    return { kind, videoId: rest[0]!, name: rest.slice(1).join(":") };
  }
  return null;
}

const nameKey = (name: string) => name.trim().toLowerCase();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

// Rows -> app ------------------------------------------------------------------

function itemFromRow(row: VideoRow, tags: QueueTag[]): QueueItem {
  return {
    id: row.id,
    videoId: row.video_id,
    url: row.url,
    title: row.title,
    channelName: row.channel_name,
    duration: row.duration,
    commentCount: row.comment_count,
    thumbnail: buildYouTubeThumbnailUrl(row.video_id),
    tags,
    watched: row.watched,
    bookmarked: row.bookmarked,
    inQueue: row.in_queue,
    addedAt: Date.parse(row.added_at),
    playbackSeconds: row.playback_seconds,
  };
}

function tagFromRow(row: TagRow): QueueTag {
  return { name: row.name, color: isTagColorId(row.color) ? row.color : DEFAULT_TAG_COLOR };
}

function remoteTagsByVideo(remote: RemoteSnapshot): Map<string, QueueTag[]> {
  const byVideo = new Map<string, QueueTag[]>();
  for (const link of remote.videoTags.values()) {
    const tag = remote.tags.get(link.tag_id);
    if (!tag) continue;
    const list = byVideo.get(link.video_id) ?? [];
    list.push(tagFromRow(tag));
    byVideo.set(link.video_id, list);
  }
  for (const list of byVideo.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return byVideo;
}

// App -> rows -------------------------------------------------------------------

export function videoRowFor(
  item: QueueItem,
  position: number,
  userId: string,
): Omit<VideoRow, "updated_at"> {
  return {
    id: item.id,
    user_id: userId,
    video_id: item.videoId,
    url: item.url,
    title: item.title,
    channel_name: item.channelName,
    duration: item.duration,
    comment_count: item.commentCount,
    watched: item.watched,
    bookmarked: item.bookmarked,
    in_queue: item.inQueue,
    position,
    playback_seconds: Math.max(0, Math.floor(item.playbackSeconds)),
    added_at: new Date(item.addedAt).toISOString(),
  };
}

export function historyRowFor(entry: HistoryEntry, userId: string): Omit<HistoryRow, "updated_at"> {
  return {
    user_id: userId,
    video_id: entry.videoId,
    url: entry.url,
    title: entry.title,
    added_at: new Date(entry.addedAt).toISOString(),
  };
}

/**
 * Tags are identified by name, which is unique per user ignoring case. Deriving the
 * row id from user and name means two devices creating the same tag write one row.
 */
export async function tagIdFor(userId: string, name: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}:${nameKey(name)}`)),
  ).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80; // version 8: custom, name-based
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Diff ----------------------------------------------------------------------------

export type LocalChanges = {
  /** Rows to write as soon as possible. */
  immediate: SyncKey[];
  /** Rows where only the playback position moved; worth batching. */
  lazy: SyncKey[];
  /** Positions for every video in `next`, for building rows. */
  positions: Map<string, number>;
};

function sameVideoFields(a: QueueItem, b: QueueItem) {
  return (
    a.videoId === b.videoId &&
    a.url === b.url &&
    a.title === b.title &&
    a.channelName === b.channelName &&
    a.duration === b.duration &&
    a.commentCount === b.commentCount &&
    a.watched === b.watched &&
    a.bookmarked === b.bookmarked &&
    a.inQueue === b.inQueue &&
    a.addedAt === b.addedAt
  );
}

/** Which rows changed between two local states. */
export function diffStates(
  prev: QueueState,
  next: QueueState,
  knownPositions: Map<string, number>,
): LocalChanges {
  const immediate = new Set<SyncKey>();
  const lazy = new Set<SyncKey>();

  const prevItems = new Map(prev.items.map((i) => [i.id, i]));
  const nextItems = new Map(next.items.map((i) => [i.id, i]));
  for (const [id, item] of prevItems) {
    if (!nextItems.has(id)) immediate.add(videoKey(id));
    for (const tag of item.tags) {
      if (!nextItems.get(id)?.tags.some((t) => nameKey(t.name) === nameKey(tag.name))) {
        immediate.add(videoTagKey(id, tag.name));
      }
    }
  }
  for (const [id, item] of nextItems) {
    const before = prevItems.get(id);
    if (!before || !sameVideoFields(before, item)) immediate.add(videoKey(id));
    else if (before.playbackSeconds !== item.playbackSeconds) lazy.add(videoKey(id));
    for (const tag of item.tags) {
      if (!before?.tags.some((t) => nameKey(t.name) === nameKey(tag.name))) {
        immediate.add(videoTagKey(id, tag.name));
      }
    }
  }

  const { positions, changed } = assignPositions(
    next.items.map((i) => i.id),
    knownPositions,
  );
  for (const id of changed) immediate.add(videoKey(id));

  const prevTags = new Map(prev.tagLibrary.map((t) => [nameKey(t.name), t]));
  const nextTags = new Map(next.tagLibrary.map((t) => [nameKey(t.name), t]));
  for (const [key, tag] of prevTags) {
    const after = nextTags.get(key);
    if (!after || after.color !== tag.color || after.name !== tag.name) {
      immediate.add(tagKey(key));
    }
  }
  for (const key of nextTags.keys()) if (!prevTags.has(key)) immediate.add(tagKey(key));

  const prevHistory = new Map(prev.history.map((e) => [e.videoId, e]));
  const nextHistory = new Map(next.history.map((e) => [e.videoId, e]));
  for (const [videoId, entry] of prevHistory) {
    const after = nextHistory.get(videoId);
    if (!after || after.title !== entry.title || after.url !== entry.url) {
      immediate.add(historyKey(videoId));
    }
  }
  for (const videoId of nextHistory.keys()) {
    if (!prevHistory.has(videoId)) immediate.add(historyKey(videoId));
  }

  if (prev.autoPlayNext !== next.autoPlayNext) immediate.add(SETTINGS_KEY);

  for (const key of immediate) lazy.delete(key);
  return { immediate: [...immediate], lazy: [...lazy], positions };
}

/**
 * The rows this browser has that the account doesn't, when local data first joins an
 * account. Where both have a video, tag, history entry or settings, the account's
 * copy wins, so those aren't uploaded.
 */
export function unsyncedKeys(local: QueueState, remote: RemoteSnapshot): SyncKey[] {
  const remoteVideos = new Set([...remote.videos.values()].map((r) => r.video_id));
  const remoteTags = new Set([...remote.tags.values()].map((r) => nameKey(r.name)));
  const keys: SyncKey[] = [];
  for (const item of local.items) {
    if (remoteVideos.has(item.videoId)) continue;
    keys.push(videoKey(item.id), ...item.tags.map((t) => videoTagKey(item.id, t.name)));
  }
  for (const tag of local.tagLibrary) {
    if (!remoteTags.has(nameKey(tag.name))) keys.push(tagKey(tag.name));
  }
  for (const entry of local.history) {
    if (!remote.history.has(entry.videoId)) keys.push(historyKey(entry.videoId));
  }
  if (!remote.settings) keys.push(SETTINGS_KEY);
  return keys;
}

// Merge ---------------------------------------------------------------------------

export type MergeResult = {
  state: QueueState;
  /** Video positions matching `state.items` order. */
  positions: Map<string, number>;
  /** Pending keys that no longer need writing, e.g. a local copy of a video the server already has. */
  settled: SyncKey[];
};

/**
 * What the app should show: the server's rows, overridden wherever this device has
 * changes the server hasn't confirmed yet (`pending`).
 */
export function mergeRemote(
  remote: RemoteSnapshot,
  local: QueueState,
  pending: ReadonlySet<SyncKey>,
  localPositions: Map<string, number>,
): MergeResult {
  const settled: SyncKey[] = [];
  const localItems = new Map(local.items.map((i) => [i.id, i]));
  const remoteTags = remoteTagsByVideo(remote);
  const remoteByYouTubeId = new Map([...remote.videos.values()].map((r) => [r.video_id, r]));

  type Placed = { item: QueueItem; position: number | undefined; localIndex: number };
  const placed = new Map<string, Placed>();

  for (const row of remote.videos.values()) {
    const key = videoKey(row.id);
    const localItem = localItems.get(row.id);
    if (pending.has(key) && !localItem) continue; // deleted here, not yet on the server
    const base = pending.has(key) && localItem ? localItem : itemFromRow(row, []);
    placed.set(row.id, {
      item: { ...base, tags: remoteTags.get(row.id) ?? [] },
      position: pending.has(key) ? (localPositions.get(row.id) ?? row.position) : row.position,
      localIndex: local.items.findIndex((i) => i.id === row.id),
    });
  }

  local.items.forEach((item, localIndex) => {
    if (placed.has(item.id) || !pending.has(videoKey(item.id))) return;
    // Added on two devices at once: the server's copy wins, this one is dropped.
    const twin = remoteByYouTubeId.get(item.videoId);
    if (twin && twin.id !== item.id) {
      settled.push(videoKey(item.id), ...item.tags.map((t) => videoTagKey(item.id, t.name)));
      return;
    }
    placed.set(item.id, {
      item: { ...item, tags: [] },
      position: localPositions.get(item.id),
      localIndex,
    });
  });

  // Tags on each video: the server's, then this device's pending additions and removals.
  for (const [id, entry] of placed) {
    const localItem = localItems.get(id);
    const byName = new Map(entry.item.tags.map((t) => [nameKey(t.name), t]));
    for (const key of pending) {
      const parsed = parseKey(key);
      if (parsed?.kind !== "vtag" || parsed.videoId !== id) continue;
      const localTag = localItem?.tags.find((t) => nameKey(t.name) === parsed.name);
      if (localTag) byName.set(parsed.name, localTag);
      else byName.delete(parsed.name);
    }
    entry.item = {
      ...entry.item,
      tags: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  // Order by position. Videos without one keep their place relative to their local
  // neighbours, after everything positioned.
  const ordered = [...placed.values()].sort((a, b) => {
    if (a.position !== undefined && b.position !== undefined) return a.position - b.position;
    if (a.position !== undefined) return -1;
    if (b.position !== undefined) return 1;
    return a.localIndex - b.localIndex;
  });
  const items = ordered.map((p) => p.item);
  const { positions } = assignPositions(
    items.map((i) => i.id),
    new Map(ordered.flatMap((p) => (p.position === undefined ? [] : [[p.item.id, p.position]]))),
  );

  const tagLibrary = new Map(
    [...remote.tags.values()].map((row) => [nameKey(row.name), tagFromRow(row)]),
  );
  const localTags = new Map(local.tagLibrary.map((t) => [nameKey(t.name), t]));
  for (const key of pending) {
    const parsed = parseKey(key);
    if (parsed?.kind !== "tag") continue;
    const localTag = localTags.get(parsed.name);
    if (localTag) tagLibrary.set(parsed.name, localTag);
    else tagLibrary.delete(parsed.name);
  }

  const history = new Map(
    [...remote.history.values()].map((row) => [
      row.video_id,
      { videoId: row.video_id, url: row.url, title: row.title, addedAt: Date.parse(row.added_at) },
    ]),
  );
  const localHistory = new Map(local.history.map((e) => [e.videoId, e]));
  for (const key of pending) {
    const parsed = parseKey(key);
    if (parsed?.kind !== "history") continue;
    const entry = localHistory.get(parsed.videoId);
    if (entry) history.set(parsed.videoId, entry);
    else history.delete(parsed.videoId);
  }

  const autoPlayNext = pending.has(SETTINGS_KEY)
    ? local.autoPlayNext
    : (remote.settings?.auto_play_next ?? local.autoPlayNext);

  return {
    state: {
      items,
      currentId: items.some((i) => i.id === local.currentId) ? local.currentId : null,
      tagLibrary: [...tagLibrary.values()].sort((a, b) => a.name.localeCompare(b.name)),
      history: [...history.values()].sort((a, b) => b.addedAt - a.addedAt),
      autoPlayNext,
    },
    positions,
    settled,
  };
}
