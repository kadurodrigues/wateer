import { beforeEach, describe, expect, test } from "bun:test";

import {
  initialQueueState,
  queueReducer,
  type QueueAction,
  type QueueItem,
  type QueueState,
} from "../queue-state.ts";
import {
  forgetSyncAccount,
  LAZY_DELAY_MS,
  SyncEngine,
  SyncError,
  type KeyValueStore,
  type RemoteChange,
  type SyncStatus,
  type SyncTransport,
  type WriteBatch,
} from "./engine.ts";
import { emptySnapshot, type RemoteSnapshot } from "./model.ts";

const USER = "00000000-0000-0000-0000-0000000000aa";
const OTHER_USER = "00000000-0000-0000-0000-0000000000bb";

// A fake clock: timers run only when the test advances time.
let now = 0;
let timers: Array<{ at: number; fn: () => void; id: number }> = [];
let timerId = 0;
const clock = {
  now: () => now,
  setTimer: (fn: () => void, ms: number) => {
    timerId += 1;
    timers.push({ at: now + ms, fn, id: timerId });
    return timerId;
  },
  clearTimer: (id: unknown) => {
    timers = timers.filter((t) => t.id !== id);
  },
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function advance(ms = 0) {
  const until = now + ms;
  for (;;) {
    await tick();
    const next = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
    if (!next) break;
    timers = timers.filter((t) => t !== next);
    now = Math.max(now, next.at);
    next.fn();
  }
  now = until;
  for (let i = 0; i < 5; i += 1) await tick();
}

/** One user's rows, enforcing what the real schema does, with realtime fan-out. */
class FakeServer {
  data = new Map<string, RemoteSnapshot>();
  online = true;
  writes = 0;
  private listeners = new Map<string, Set<(c: RemoteChange) => void>>();

  snapshot(userId: string) {
    let snap = this.data.get(userId);
    if (!snap) this.data.set(userId, (snap = emptySnapshot()));
    return snap;
  }

  transport(userId: string): SyncTransport {
    const clone = (s: RemoteSnapshot): RemoteSnapshot => ({
      videos: new Map(s.videos),
      tags: new Map(s.tags),
      videoTags: new Map(s.videoTags),
      history: new Map(s.history),
      settings: s.settings,
    });
    return {
      fetchSnapshot: async () => {
        if (!this.online) throw new SyncError("network", "offline");
        return clone(this.snapshot(userId));
      },
      write: async (batch) => this.write(userId, batch),
      subscribe: (onChange) => {
        const set = this.listeners.get(userId) ?? new Set();
        set.add(onChange);
        this.listeners.set(userId, set);
        return () => set.delete(onChange);
      },
    };
  }

  private emit(userId: string, change: RemoteChange) {
    for (const listener of this.listeners.get(userId) ?? []) listener(change);
  }

  private write(userId: string, batch: WriteBatch) {
    if (!this.online) throw new SyncError("network", "offline");
    const s = this.snapshot(userId);
    const stamp = new Date(now).toISOString();
    for (const row of batch.videos) {
      const twin = [...s.videos.values()].find(
        (v) => v.video_id === row.video_id && v.id !== row.id,
      );
      if (twin) throw new SyncError("conflict", "duplicate key value violates unique constraint");
    }
    this.writes += 1;
    for (const row of batch.tags) {
      const full = { ...row, id: row.id!, user_id: userId, created_at: stamp, updated_at: stamp };
      s.tags.set(full.id, full);
      this.emit(userId, { table: "tags", type: "upsert", row: full });
    }
    for (const row of batch.videos) {
      const full = {
        title: null,
        channel_name: null,
        duration: null,
        comment_count: null,
        watched: false,
        bookmarked: false,
        in_queue: true,
        playback_seconds: 0,
        added_at: stamp,
        ...row,
        user_id: userId,
        updated_at: stamp,
      };
      s.videos.set(row.id, full);
      this.emit(userId, { table: "videos", type: "upsert", row: full });
    }
    for (const row of batch.videoTags) {
      if (!s.videos.has(row.video_id) || !s.tags.has(row.tag_id)) {
        throw new SyncError("rejected", "foreign key violation");
      }
      const full = {
        video_id: row.video_id,
        tag_id: row.tag_id,
        user_id: userId,
        created_at: stamp,
      };
      s.videoTags.set(`${row.video_id}:${row.tag_id}`, full);
      this.emit(userId, { table: "video_tags", type: "upsert", row: full });
    }
    for (const { videoId, tagId } of batch.deleteVideoTags) {
      if (s.videoTags.delete(`${videoId}:${tagId}`)) {
        this.emit(userId, { table: "video_tags", type: "delete", videoId, tagId });
      }
    }
    for (const id of batch.deleteVideos) {
      if (!s.videos.delete(id)) continue;
      for (const [key, link] of s.videoTags) if (link.video_id === id) s.videoTags.delete(key);
      this.emit(userId, { table: "videos", type: "delete", id });
    }
    for (const id of batch.deleteTags) {
      if (!s.tags.delete(id)) continue;
      for (const [key, link] of s.videoTags) if (link.tag_id === id) s.videoTags.delete(key);
      this.emit(userId, { table: "tags", type: "delete", id });
    }
    for (const row of batch.history) {
      const full = { title: null, added_at: stamp, ...row, user_id: userId, updated_at: stamp };
      s.history.set(row.video_id, full);
      this.emit(userId, { table: "history", type: "upsert", row: full });
    }
    for (const videoId of batch.deleteHistory) {
      if (s.history.delete(videoId))
        this.emit(userId, { table: "history", type: "delete", userId, videoId });
    }
    if (batch.settings) {
      s.settings = {
        user_id: userId,
        auto_play_next: batch.settings.auto_play_next ?? false,
        updated_at: stamp,
      };
      this.emit(userId, { table: "user_settings", type: "upsert", row: s.settings });
    }
  }
}

function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
}

/** A browser: app state driven by the reducer, with the engine watching it. */
class Device {
  state: QueueState;
  engine!: SyncEngine;
  statuses: SyncStatus[] = [];

  constructor(
    private server: FakeServer,
    readonly storage = memoryStore(),
    initial: QueueState = initialQueueState,
  ) {
    this.state = initial;
  }

  async signIn(userId = USER) {
    this.engine = new SyncEngine({
      transport: this.server.transport(userId),
      userId,
      getState: () => this.state,
      applyState: (next) => this.set(queueReducer(this.state, { type: "sync", state: next })),
      storage: this.storage,
      onStatus: (status) => this.statuses.push(status),
      ...clock,
    });
    await this.engine.start();
    await advance();
  }

  dispatch(action: QueueAction) {
    this.set(queueReducer(this.state, action));
  }

  private set(next: QueueState) {
    this.state = next;
    // What QueueProvider's effect does after each render.
    this.engine?.noteLocalState(next);
  }

  titles() {
    return this.state.items.map((i) => i.title);
  }
}

let n = 0;
function newItem(title: string, videoId?: string): QueueItem {
  n += 1;
  return {
    id: crypto.randomUUID(),
    videoId: videoId ?? `vid${String(n).padStart(8, "0")}`,
    url: "https://www.youtube.com/watch?v=x",
    title,
    channelName: null,
    duration: null,
    commentCount: null,
    thumbnail: "",
    tags: [],
    watched: false,
    bookmarked: false,
    inQueue: true,
    addedAt: n,
    playbackSeconds: 0,
  };
}

let server: FakeServer;
beforeEach(() => {
  now = 1_000_000;
  timers = [];
  server = new FakeServer();
});

async function twoDevices() {
  const laptop = new Device(server);
  const phone = new Device(server);
  await laptop.signIn();
  await phone.signIn();
  return { laptop, phone };
}

describe("between two signed-in devices", () => {
  test("adding, reordering and removing videos", async () => {
    const { laptop, phone } = await twoDevices();
    for (const title of ["A", "B", "C"]) laptop.dispatch({ type: "add", item: newItem(title) });
    await advance(100);
    expect(phone.titles()).toEqual(["A", "B", "C"]);

    const [a, , c] = phone.state.items;
    phone.dispatch({
      type: "reorder",
      sourceId: c!.id,
      targetId: a!.id,
      section: "unwatched",
      position: "before",
    });
    await advance(100);
    expect(laptop.titles()).toEqual(["C", "A", "B"]);

    laptop.dispatch({ type: "remove", id: a!.id });
    await advance(100);
    expect(phone.titles()).toEqual(["C", "B"]);
  });

  test("bookmarks, tags, history and settings", async () => {
    const { laptop, phone } = await twoDevices();
    const video = newItem("Talk");
    laptop.dispatch({ type: "add", item: video });
    laptop.dispatch({ type: "toggle-bookmark", id: video.id });
    laptop.dispatch({ type: "create-tag", tag: { name: "Science", color: "teal" } });
    laptop.dispatch({
      type: "update-tags",
      id: video.id,
      tags: [{ name: "Science", color: "teal" }],
    });
    laptop.dispatch({ type: "set-auto-play", value: true });
    await advance(100);

    const synced = phone.state.items[0]!;
    expect(synced.bookmarked).toBe(true);
    expect(synced.tags).toEqual([{ name: "Science", color: "teal" }]);
    expect(phone.state.tagLibrary).toEqual([{ name: "Science", color: "teal" }]);
    expect(phone.state.history.map((e) => e.title)).toEqual(["Talk"]);
    expect(phone.state.autoPlayNext).toBe(true);

    phone.dispatch({ type: "delete-tag", name: "science" });
    await advance(100);
    expect(laptop.state.items[0]!.tags).toEqual([]);
    expect(laptop.state.tagLibrary).toEqual([]);
  });

  test("each device keeps playing its own video", async () => {
    const { laptop, phone } = await twoDevices();
    const [x, y] = [newItem("X"), newItem("Y")];
    laptop.dispatch({ type: "add", item: x });
    laptop.dispatch({ type: "add", item: y });
    await advance(100);
    phone.dispatch({ type: "set-current", id: x.id });
    laptop.dispatch({ type: "set-current", id: y.id });
    laptop.dispatch({ type: "toggle-watched", id: x.id });
    await advance(100);
    expect(phone.state.currentId).toBe(x.id);
    expect(laptop.state.currentId).toBe(y.id);
  });

  test("playback position is batched, not sent every update", async () => {
    const { laptop, phone } = await twoDevices();
    const video = newItem("Long");
    laptop.dispatch({ type: "add", item: video });
    await advance(100);
    const writes = server.writes;
    for (let s = 3; s <= 30; s += 3) {
      laptop.dispatch({ type: "update-playback", id: video.id, seconds: s });
      await advance(3_000);
    }
    expect(server.writes - writes).toBeLessThanOrEqual(2);
    await advance(LAZY_DELAY_MS);
    expect(phone.state.items[0]!.playbackSeconds).toBe(30);
  });

  test("the same video added on both at once ends up once", async () => {
    const { laptop, phone } = await twoDevices();
    server.online = false;
    laptop.dispatch({ type: "add", item: newItem("Laptop's copy", "dQw4w9WgXcQ") });
    phone.dispatch({ type: "add", item: newItem("Phone's copy", "dQw4w9WgXcQ") });
    server.online = true;
    await advance(2_000); // laptop retries first and wins
    await advance(60_000);
    expect(laptop.titles()).toEqual(["Laptop's copy"]);
    expect(phone.titles()).toEqual(["Laptop's copy"]);
    expect(server.snapshot(USER).videos.size).toBe(1);
  });
});

describe("offline", () => {
  test("changes made offline are sent when the connection returns", async () => {
    const { laptop, phone } = await twoDevices();
    server.online = false;
    laptop.dispatch({ type: "add", item: newItem("Offline add") });
    await advance(100);
    expect(laptop.statuses.at(-1)).toBe("offline");
    server.online = true;
    await advance(60_000);
    expect(phone.titles()).toEqual(["Offline add"]);
    expect(laptop.statuses.at(-1)).toBe("synced");
  });

  test("pending changes survive a reload", async () => {
    const laptop = new Device(server);
    await laptop.signIn();
    server.online = false;
    laptop.dispatch({ type: "add", item: newItem("Saved before closing") });
    await advance(100);
    laptop.engine.stop();

    // The app reopens with its saved state and the same sync storage.
    server.online = true;
    const reopened = new Device(server, laptop.storage, laptop.state);
    await reopened.signIn();
    await advance(100);
    expect([...server.snapshot(USER).videos.values()].map((v) => v.title)).toEqual([
      "Saved before closing",
    ]);
  });

  test("a video deleted elsewhere while this device was closed stays deleted", async () => {
    const { laptop, phone } = await twoDevices();
    const video = newItem("Doomed");
    laptop.dispatch({ type: "add", item: video });
    await advance(100);
    phone.engine.stop();
    laptop.dispatch({ type: "remove", id: video.id });
    await advance(100);

    const reopened = new Device(server, phone.storage, phone.state);
    expect(reopened.titles()).toEqual(["Doomed"]);
    await reopened.signIn();
    expect(reopened.titles()).toEqual([]);
  });
});

describe("signing in with existing local data", () => {
  test("the first sign-in adds this browser's videos after the account's", async () => {
    const laptop = new Device(server);
    await laptop.signIn();
    laptop.dispatch({ type: "add", item: newItem("In account", "dQw4w9WgXcQ") });
    await advance(100);

    let local = initialQueueState;
    for (const item of [newItem("Same video, local copy", "dQw4w9WgXcQ"), newItem("Only local")]) {
      local = queueReducer(local, { type: "add", item });
    }
    const phone = new Device(server, memoryStore(), local);
    await phone.signIn();
    await advance(100);

    expect(phone.titles()).toEqual(["In account", "Only local"]);
    expect(laptop.titles()).toEqual(["In account", "Only local"]);
  });

  test("another account's leftover data is never merged in", async () => {
    const shared = memoryStore();
    const first = new Device(server, shared);
    await first.signIn(OTHER_USER);
    first.dispatch({ type: "add", item: newItem("Other person's video") });
    await advance(100);
    first.engine.stop();

    const next = new Device(server, shared, first.state);
    await next.signIn(USER);
    expect(next.titles()).toEqual([]);
    expect(server.snapshot(USER).videos.size).toBe(0);
  });
});

describe("signing out", () => {
  test("drain sends batched playback positions right away", async () => {
    const { laptop, phone } = await twoDevices();
    const video = newItem("Paused mid-way");
    laptop.dispatch({ type: "add", item: video });
    await advance(100);
    laptop.dispatch({ type: "update-playback", id: video.id, seconds: 95 });
    await advance(100);
    expect(server.snapshot(USER).videos.get(video.id)?.playback_seconds).toBe(0);

    expect(await laptop.engine.drain()).toBe(0);
    expect(server.snapshot(USER).videos.get(video.id)?.playback_seconds).toBe(95);
    await advance(100);
    expect(phone.state.items[0]!.playbackSeconds).toBe(95);
  });

  test("drain reports what couldn't be sent while offline", async () => {
    const { laptop } = await twoDevices();
    server.online = false;
    laptop.dispatch({ type: "add", item: newItem("Stuck") });
    await advance(100);
    const draining = laptop.engine.drain();
    await advance(1_000);
    expect(await draining).toBeGreaterThan(0);
  });

  test("clearing one tab after sign-out never empties the account from another tab", async () => {
    const shared = memoryStore();
    const tab1 = new Device(server, shared);
    await tab1.signIn();
    for (const title of ["Keep", "These"]) tab1.dispatch({ type: "add", item: newItem(title) });
    await advance(100);
    const tab2 = new Device(server, shared, tab1.state);
    await tab2.signIn();
    await advance(100);

    // Tab 2 signs out: it stops its engine, marks the browser signed out, clears itself.
    tab2.engine.stop();
    forgetSyncAccount(shared, now);
    tab2.dispatch({ type: "replace", state: initialQueueState });
    // Tab 1 receives the cleared state through storage events before hearing of it.
    tab1.dispatch({ type: "replace", state: initialQueueState });
    await advance(60_000);

    expect([...server.snapshot(USER).videos.values()].map((v) => v.title).sort()).toEqual([
      "Keep",
      "These",
    ]);
  });
});
