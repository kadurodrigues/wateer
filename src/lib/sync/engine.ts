import type { TablesInsert } from "@/lib/database.types";
import type { QueueState } from "@/lib/queue-state";

import {
  diffStates,
  emptySnapshot,
  historyRowFor,
  isUuid,
  mergeRemote,
  parseKey,
  tagIdFor,
  unsyncedKeys,
  videoRowFor,
  type HistoryRow,
  type RemoteSnapshot,
  type SettingsRow,
  type SyncKey,
  type TagRow,
  type VideoRow,
  type VideoTagRow,
} from "./model";

// Transport: how the engine reaches the server. Supabase in the app, fakes in tests.

export type RemoteChange =
  | { table: "videos"; type: "upsert"; row: VideoRow }
  | { table: "videos"; type: "delete"; id: string }
  | { table: "tags"; type: "upsert"; row: TagRow }
  | { table: "tags"; type: "delete"; id: string }
  | { table: "video_tags"; type: "upsert"; row: VideoTagRow }
  | { table: "video_tags"; type: "delete"; videoId: string; tagId: string }
  | { table: "history"; type: "upsert"; row: HistoryRow }
  | { table: "history"; type: "delete"; userId: string; videoId: string }
  | { table: "user_settings"; type: "upsert"; row: SettingsRow };

/** One flush's worth of writes. The transport applies them in this field order. */
export type WriteBatch = {
  tags: TablesInsert<"tags">[];
  videos: TablesInsert<"videos">[];
  videoTags: TablesInsert<"video_tags">[];
  deleteVideoTags: Array<{ videoId: string; tagId: string }>;
  deleteVideos: string[];
  deleteTags: string[];
  history: TablesInsert<"history">[];
  deleteHistory: string[];
  settings: TablesInsert<"user_settings"> | null;
};

export class SyncError extends Error {
  constructor(
    /** network: try again later. conflict: the server has a row we didn't expect. rejected: won't succeed as is. */
    readonly kind: "network" | "conflict" | "rejected",
    message: string,
  ) {
    super(message);
  }
}

export interface SyncTransport {
  fetchSnapshot(): Promise<RemoteSnapshot>;
  /** Throws SyncError. */
  write(batch: WriteBatch): Promise<void>;
  /** `onReconnect` fires when the live connection comes back after a drop. */
  subscribe(onChange: (change: RemoteChange) => void, onReconnect: () => void): () => void;
}

export type SyncStatus = "starting" | "syncing" | "synced" | "offline" | "error";

export type KeyValueStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

// Engine --------------------------------------------------------------------------

const META_KEY = "wateer-sync-v1";

/**
 * Forget which account this browser last synced with, e.g. after signing out. The next
 * sign-in then merges this browser's data into the account instead of treating the
 * account as the whole truth, which would drop anything added while signed out.
 */
export function forgetSyncAccount(storage: KeyValueStore, now = Date.now()) {
  const meta: Meta = { userId: null, pending: [], signedOutAt: now };
  storage.set(META_KEY, JSON.stringify(meta));
}

/** Playback position is the one high-frequency field; send it at most this often. */
export const LAZY_DELAY_MS = 15_000;
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

type Meta = {
  userId: string | null;
  pending: Array<[SyncKey, number]>;
  /** Set on sign-out; engines started earlier (e.g. in other tabs) must stand down. */
  signedOutAt?: number;
};

export type SyncEngineOptions = {
  transport: SyncTransport;
  userId: string;
  /** The app's latest state. */
  getState: () => QueueState;
  /** Show `state` in the app (it keeps its own current video). */
  applyState: (state: QueueState) => void;
  storage: KeyValueStore;
  onStatus?: (status: SyncStatus) => void;
  /** Called when writes are dropped because the server will never accept them. */
  onDropped?: (error: SyncError) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export class SyncEngine {
  private readonly o: Required<SyncEngineOptions>;
  private mirror: RemoteSnapshot = emptySnapshot();
  private baseline: QueueState;
  private positions = new Map<string, number>();
  /** Keys waiting to be written: when they're due, and a version to spot re-edits. */
  private pending = new Map<SyncKey, { due: number; version: number }>();
  private version = 0;
  private ready = false;
  private stopped = false;
  private flushing = false;
  private flushAgain = false;
  private timer: unknown = null;
  private retries = 0;
  private conflicts = 0;
  private remergeQueued = false;
  private unsubscribe: (() => void) | null = null;
  private status: SyncStatus = "starting";
  private startedAt = 0;

  constructor(options: SyncEngineOptions) {
    this.o = {
      onStatus: () => {},
      onDropped: () => {},
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      ...options,
    };
    this.baseline = options.getState();
    this.positions = new Map(this.baseline.items.map((item, i) => [item.id, i + 1]));
  }

  async start() {
    this.startedAt = this.o.now();
    const meta = this.readMeta();
    const sameAccount = meta.userId === this.o.userId;
    if (sameAccount) {
      for (const [key, due] of meta.pending) this.enqueue(key, due);
    }
    this.unsubscribe = this.o.transport.subscribe(
      (change) => this.onRemoteChange(change),
      () => void this.resync(),
    );
    await this.resync(sameAccount ? "returning" : meta.userId ? "other-account" : "first");
  }

  stop() {
    this.stopped = true;
    this.unsubscribe?.();
    if (this.timer !== null) this.o.clearTimer(this.timer);
  }

  get pendingCount() {
    return this.pending.size;
  }

  /**
   * Send everything pending, including batched playback positions, and wait. Returns
   * how many changes are still unsent: 0 unless offline, rejected or out of time.
   */
  async drain(timeoutMs = 8_000): Promise<number> {
    const deadline = this.o.now() + timeoutMs;
    const now = this.o.now();
    for (const entry of this.pending.values()) entry.due = Math.min(entry.due, now);
    while (this.pending.size && !this.stopped && this.ready && this.o.now() < deadline) {
      if (this.status === "offline" || this.status === "error") break;
      if (this.flushing)
        await new Promise<void>((resolve) => this.o.setTimer(() => resolve(), 100));
      else await this.flush();
    }
    return this.pending.size;
  }

  /**
   * Another tab signed out after this engine started. Its cleared local data reaches
   * this tab through storage events, possibly before this tab hears about the sign-out,
   * and must never be synced as "delete everything".
   */
  private signedOutElsewhere(): boolean {
    const meta = this.readMeta();
    return meta.userId === null && (meta.signedOutAt ?? 0) >= this.startedAt;
  }

  /** Call with every new local state; records which rows the change touched. */
  noteLocalState(next: QueueState) {
    if (this.stopped || next === this.baseline) return;
    if (this.startedAt && this.signedOutElsewhere()) {
      this.stop();
      return;
    }
    const { immediate, lazy, positions } = diffStates(this.baseline, next, this.positions);
    this.baseline = next;
    this.positions = positions;
    const now = this.o.now();
    for (const key of immediate) this.enqueue(key, now);
    for (const key of lazy) this.enqueue(key, now + LAZY_DELAY_MS);
    if (immediate.length || lazy.length) {
      this.saveMeta();
      if (this.ready) this.scheduleFlush();
    }
  }

  /** Send everything now, including batched playback positions (e.g. when the page hides). */
  flushNow() {
    const now = this.o.now();
    for (const entry of this.pending.values()) entry.due = Math.min(entry.due, now);
    void this.flush();
  }

  /** Refetch everything from the server and re-merge, e.g. after the device slept. */
  async resync(mode: "returning" | "first" | "other-account" = "returning") {
    if (this.stopped) return;
    this.setStatus("syncing");
    let snapshot: RemoteSnapshot;
    try {
      snapshot = await this.o.transport.fetchSnapshot();
    } catch (error) {
      this.setStatus(error instanceof SyncError && error.kind !== "network" ? "error" : "offline");
      this.retryLater(() => void this.resync(mode));
      return;
    }
    if (this.stopped) return;
    this.mirror = snapshot;
    // Catch changes made since the last note, so the merge can't overwrite them.
    this.noteLocalState(this.o.getState());

    let local = this.o.getState();
    if (mode === "other-account") {
      // This browser's data belongs to a different account: show this account's instead.
      this.pending.clear();
      this.positions = new Map();
      local = { ...local, items: [], tagLibrary: [], history: [] };
    } else if (mode === "first") {
      local = withUuidIds(local);
      // No local positions: this browser's videos line up after the account's.
      this.positions = new Map();
      const now = this.o.now();
      for (const key of unsyncedKeys(local, snapshot)) this.enqueue(key, now);
    }
    this.ready = true;
    this.remerge(local);
    this.saveMeta();
    this.retries = 0;
    await this.flush();
    if (!this.pending.size) this.setStatus("synced");
  }

  // Internals ---------------------------------------------------------------------

  private enqueue(key: SyncKey, due: number) {
    const existing = this.pending.get(key);
    this.version += 1;
    this.pending.set(key, {
      due: existing ? Math.min(existing.due, due) : due,
      version: this.version,
    });
  }

  private remerge(local: QueueState = this.o.getState()) {
    const { state, positions, settled } = mergeRemote(
      this.mirror,
      local,
      new Set(this.pending.keys()),
      this.positions,
    );
    for (const key of settled) this.pending.delete(key);
    this.positions = positions;
    this.baseline = state;
    this.o.applyState(state);
  }

  private onRemoteChange(change: RemoteChange) {
    applyChange(this.mirror, change, this.o.userId);
    if (!this.ready || this.remergeQueued) return;
    // A burst of events (e.g. another device clearing watched videos) merges once.
    this.remergeQueued = true;
    this.o.setTimer(() => {
      this.remergeQueued = false;
      if (this.stopped) return;
      this.noteLocalState(this.o.getState());
      this.remerge();
    }, 50);
  }

  private scheduleFlush() {
    if (this.timer !== null) this.o.clearTimer(this.timer);
    this.timer = null;
    let next = Infinity;
    for (const entry of this.pending.values()) next = Math.min(next, entry.due);
    if (next === Infinity) return;
    this.timer = this.o.setTimer(
      () => {
        this.timer = null;
        void this.flush();
      },
      Math.max(0, next - this.o.now()),
    );
  }

  private async flush(): Promise<void> {
    if (this.stopped || !this.ready) return;
    if (this.signedOutElsewhere()) {
      this.stop();
      return;
    }
    if (this.flushing) {
      this.flushAgain = true;
      return;
    }
    const now = this.o.now();
    const due = [...this.pending].filter(([, entry]) => entry.due <= now);
    if (!due.length) {
      this.scheduleFlush();
      return;
    }

    this.flushing = true;
    this.setStatus("syncing");
    const versions = new Map(due.map(([key, entry]) => [key, entry.version]));
    try {
      const batch = await this.buildBatch(due.map(([key]) => key));
      await this.o.transport.write(batch);
      applyBatch(this.mirror, batch, this.o.userId, new Date(this.o.now()).toISOString());
      for (const [key, version] of versions) {
        if (this.pending.get(key)?.version === version) this.pending.delete(key);
      }
      this.retries = 0;
      this.conflicts = 0;
      this.saveMeta();
      this.setStatus(this.pending.size ? "syncing" : "synced");
    } catch (error) {
      const kind = error instanceof SyncError ? error.kind : "network";
      if (kind === "network") {
        this.setStatus("offline");
        this.retryLater(() => void this.flush());
      } else if (kind === "conflict" && this.conflicts < 2) {
        // Usually the same video added on two devices at once; the merge settles it.
        this.conflicts += 1;
        this.flushing = false;
        await this.resync();
        return;
      } else {
        // Rejected, or a conflict re-reading didn't resolve: these writes can't succeed.
        this.conflicts = 0;
        for (const [key, version] of versions) {
          if (this.pending.get(key)?.version === version) this.pending.delete(key);
        }
        this.saveMeta();
        this.setStatus("error");
        this.o.onDropped(error as SyncError);
      }
    } finally {
      this.flushing = false;
    }
    if (this.flushAgain) {
      this.flushAgain = false;
      await this.flush();
    } else if (this.status !== "offline") {
      this.scheduleFlush();
    }
  }

  private async buildBatch(keys: SyncKey[]): Promise<WriteBatch> {
    const { userId } = this.o;
    const state = this.baseline;
    const items = new Map(state.items.map((i) => [i.id, i]));
    const library = new Map(state.tagLibrary.map((t) => [t.name.trim().toLowerCase(), t]));
    const history = new Map(state.history.map((e) => [e.videoId, e]));
    const batch: WriteBatch = {
      tags: [],
      videos: [],
      videoTags: [],
      deleteVideoTags: [],
      deleteVideos: [],
      deleteTags: [],
      history: [],
      deleteHistory: [],
      settings: null,
    };
    const tagRows = new Map<string, TablesInsert<"tags">>();
    const videoRows = new Map<string, TablesInsert<"videos">>();
    const addVideo = (id: string) => {
      const item = items.get(id);
      const position = this.positions.get(id);
      if (item && position !== undefined) videoRows.set(id, videoRowFor(item, position, userId));
    };
    const addTag = async (name: string, color: TagRow["color"]) => {
      const id = await tagIdFor(userId, name);
      tagRows.set(id, { id, user_id: userId, name: name.trim(), color });
      return id;
    };

    for (const key of keys) {
      const parsed = parseKey(key);
      if (!parsed) continue;
      switch (parsed.kind) {
        case "video":
          if (items.has(parsed.id)) addVideo(parsed.id);
          else batch.deleteVideos.push(parsed.id);
          break;
        case "tag": {
          const tag = library.get(parsed.name);
          if (tag) await addTag(tag.name, tag.color);
          else batch.deleteTags.push(await tagIdFor(userId, parsed.name));
          break;
        }
        case "vtag": {
          const item = items.get(parsed.videoId);
          const tag = item?.tags.find((t) => t.name.trim().toLowerCase() === parsed.name);
          if (item && tag) {
            // The link needs both ends on the server.
            const tagId = await tagIdFor(userId, tag.name);
            if (!this.mirror.tags.has(tagId)) await addTag(tag.name, tag.color);
            if (!this.mirror.videos.has(item.id)) addVideo(item.id);
            batch.videoTags.push({ video_id: item.id, tag_id: tagId, user_id: userId });
          } else {
            batch.deleteVideoTags.push({
              videoId: parsed.videoId,
              tagId: await tagIdFor(userId, parsed.name),
            });
          }
          break;
        }
        case "history": {
          const entry = history.get(parsed.videoId);
          if (entry) batch.history.push(historyRowFor(entry, userId));
          else batch.deleteHistory.push(parsed.videoId);
          break;
        }
        case "settings":
          batch.settings = { user_id: userId, auto_play_next: state.autoPlayNext };
          break;
      }
    }
    batch.tags = [...tagRows.values()];
    batch.videos = [...videoRows.values()];
    return batch;
  }

  private retryLater(fn: () => void) {
    const delay = RETRY_DELAYS_MS[Math.min(this.retries, RETRY_DELAYS_MS.length - 1)]!;
    this.retries += 1;
    if (this.timer !== null) this.o.clearTimer(this.timer);
    this.timer = this.o.setTimer(() => {
      this.timer = null;
      if (!this.stopped) fn();
    }, delay);
  }

  private setStatus(status: SyncStatus) {
    if (status === this.status) return;
    this.status = status;
    this.o.onStatus(status);
  }

  private readMeta(): Meta {
    try {
      const raw = this.o.storage.get(META_KEY);
      const meta = raw ? (JSON.parse(raw) as Partial<Meta>) : {};
      return {
        userId: typeof meta.userId === "string" ? meta.userId : null,
        pending: Array.isArray(meta.pending) ? meta.pending : [],
        ...(typeof meta.signedOutAt === "number" ? { signedOutAt: meta.signedOutAt } : {}),
      };
    } catch {
      return { userId: null, pending: [] };
    }
  }

  private saveMeta() {
    const meta: Meta = {
      userId: this.o.userId,
      pending: [...this.pending].map(([key, entry]) => [key, entry.due]),
    };
    try {
      this.o.storage.set(META_KEY, JSON.stringify(meta));
    } catch {
      // Storage full or blocked: pending writes still go out from memory this session.
    }
  }
}

/** Ids created without crypto.randomUUID can't be stored in a uuid column; give them new ones. */
function withUuidIds(state: QueueState): QueueState {
  if (state.items.every((i) => isUuid(i.id))) return state;
  const renamed = new Map<string, string>();
  const items = state.items.map((item) => {
    if (isUuid(item.id)) return item;
    const id = crypto.randomUUID();
    renamed.set(item.id, id);
    return { ...item, id };
  });
  const currentId = state.currentId ? (renamed.get(state.currentId) ?? state.currentId) : null;
  return { ...state, items, currentId };
}

function applyChange(mirror: RemoteSnapshot, change: RemoteChange, userId: string) {
  switch (change.table) {
    case "videos":
      if (change.type === "upsert") mirror.videos.set(change.row.id, change.row);
      else mirror.videos.delete(change.id);
      break;
    case "tags":
      if (change.type === "upsert") mirror.tags.set(change.row.id, change.row);
      else {
        mirror.tags.delete(change.id);
        for (const [key, link] of mirror.videoTags) {
          if (link.tag_id === change.id) mirror.videoTags.delete(key);
        }
      }
      break;
    case "video_tags":
      if (change.type === "upsert") {
        mirror.videoTags.set(`${change.row.video_id}:${change.row.tag_id}`, change.row);
      } else mirror.videoTags.delete(`${change.videoId}:${change.tagId}`);
      break;
    case "history":
      if (change.type === "upsert") mirror.history.set(change.row.video_id, change.row);
      // Delete events aren't filtered by user; history's key includes it.
      else if (change.userId === userId) mirror.history.delete(change.videoId);
      break;
    case "user_settings":
      mirror.settings = change.row;
      break;
  }
}

/** Record a successful write in the mirror, as the server now has it. */
function applyBatch(mirror: RemoteSnapshot, batch: WriteBatch, userId: string, now: string) {
  for (const row of batch.tags) {
    mirror.tags.set(row.id!, {
      id: row.id!,
      user_id: userId,
      name: row.name,
      color: row.color,
      created_at: now,
      updated_at: now,
    });
  }
  for (const row of batch.videos)
    mirror.videos.set(row.id, { ...(row as VideoRow), updated_at: now });
  for (const row of batch.videoTags) {
    mirror.videoTags.set(`${row.video_id}:${row.tag_id}`, {
      video_id: row.video_id,
      tag_id: row.tag_id,
      user_id: userId,
      created_at: now,
    });
  }
  for (const { videoId, tagId } of batch.deleteVideoTags)
    mirror.videoTags.delete(`${videoId}:${tagId}`);
  for (const id of batch.deleteVideos) {
    mirror.videos.delete(id);
    for (const [key, link] of mirror.videoTags)
      if (link.video_id === id) mirror.videoTags.delete(key);
  }
  for (const id of batch.deleteTags)
    applyChange(mirror, { table: "tags", type: "delete", id }, userId);
  for (const row of batch.history)
    mirror.history.set(row.video_id, { ...(row as HistoryRow), updated_at: now });
  for (const videoId of batch.deleteHistory) mirror.history.delete(videoId);
  if (batch.settings) {
    mirror.settings = {
      user_id: userId,
      auto_play_next: batch.settings.auto_play_next ?? false,
      updated_at: now,
    };
  }
}
