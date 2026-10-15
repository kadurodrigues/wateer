import { describe, expect, test } from "bun:test";

import { initialQueueState, type QueueItem, type QueueState } from "../queue-state.ts";
import {
  diffStates,
  emptySnapshot,
  historyKey,
  isUuid,
  mergeRemote,
  SETTINGS_KEY,
  tagIdFor,
  tagKey,
  unsyncedKeys,
  videoKey,
  videoTagKey,
  type RemoteSnapshot,
  type VideoRow,
} from "./model.ts";

const USER = "00000000-0000-0000-0000-0000000000aa";
const T0 = Date.parse("2026-01-01T00:00:00Z");

function item(id: string, overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id,
    videoId: `yt${id}`.padEnd(11, "x"),
    url: `https://www.youtube.com/watch?v=${id}`,
    title: `Video ${id}`,
    channelName: null,
    duration: null,
    commentCount: null,
    thumbnail: "",
    tags: [],
    watched: false,
    bookmarked: false,
    inQueue: true,
    addedAt: T0,
    playbackSeconds: 0,
    ...overrides,
  };
}

const state = (items: QueueItem[], overrides: Partial<QueueState> = {}): QueueState => ({
  ...initialQueueState,
  items,
  ...overrides,
});

function row(i: QueueItem, position: number, overrides: Partial<VideoRow> = {}): VideoRow {
  return {
    id: i.id,
    user_id: USER,
    video_id: i.videoId,
    url: i.url,
    title: i.title,
    channel_name: i.channelName,
    duration: i.duration,
    comment_count: i.commentCount,
    watched: i.watched,
    bookmarked: i.bookmarked,
    in_queue: i.inQueue,
    position,
    playback_seconds: i.playbackSeconds,
    added_at: new Date(i.addedAt).toISOString(),
    updated_at: new Date(T0).toISOString(),
    ...overrides,
  };
}

function remote(rows: VideoRow[], extra: Partial<RemoteSnapshot> = {}): RemoteSnapshot {
  return { ...emptySnapshot(), videos: new Map(rows.map((r) => [r.id, r])), ...extra };
}

const ids = (s: QueueState) => s.items.map((i) => i.id);
const positionsOf = (s: QueueState) => new Map(s.items.map((i, n) => [i.id, n + 1]));

describe("diffStates", () => {
  test("a new video brings its row and its tags", () => {
    const before = state([item("a")]);
    const after = state([item("a"), item("b", { tags: [{ name: "Music", color: "blue" }] })]);
    const { immediate, lazy } = diffStates(before, after, positionsOf(before));
    expect(immediate.sort()).toEqual([videoKey("b"), videoTagKey("b", "music")].sort());
    expect(lazy).toEqual([]);
  });

  test("playback-only changes are batched, anything else is sent right away", () => {
    const before = state([item("a"), item("b")]);
    const after = state([item("a", { playbackSeconds: 42 }), item("b", { watched: true })]);
    const { immediate, lazy } = diffStates(before, after, positionsOf(before));
    expect(immediate).toEqual([videoKey("b")]);
    expect(lazy).toEqual([videoKey("a")]);
  });

  test("reordering touches only the moved video", () => {
    const before = state([item("a"), item("b"), item("c")]);
    const after = state([item("b"), item("c"), item("a")]);
    expect(diffStates(before, after, positionsOf(before)).immediate).toEqual([videoKey("a")]);
  });

  test("removals, tag library, history and settings", () => {
    const before = state([item("a", { tags: [{ name: "Music", color: "blue" }] })], {
      tagLibrary: [{ name: "Music", color: "blue" }],
      history: [{ videoId: "v1", url: "u", title: null, addedAt: T0 }],
    });
    const after = state([], {
      tagLibrary: [{ name: "Music", color: "red" }],
      history: [],
      autoPlayNext: true,
    });
    expect(diffStates(before, after, positionsOf(before)).immediate.sort()).toEqual(
      [
        videoKey("a"),
        videoTagKey("a", "Music"),
        tagKey("music"),
        historyKey("v1"),
        SETTINGS_KEY,
      ].sort(),
    );
  });
});

describe("mergeRemote", () => {
  test("builds the app's state from rows, in position order, with tags", async () => {
    const a = item("a");
    const b = item("b");
    const tagId = await tagIdFor(USER, "Music");
    const snapshot = remote([row(a, 2), row(b, 1)], {
      tags: new Map([
        [
          tagId,
          {
            id: tagId,
            user_id: USER,
            name: "Music",
            color: "blue",
            created_at: "",
            updated_at: "",
          },
        ],
      ]),
      videoTags: new Map([
        [`a:${tagId}`, { video_id: "a", tag_id: tagId, user_id: USER, created_at: "" }],
      ]),
      settings: { user_id: USER, auto_play_next: true, updated_at: "" },
    });
    const { state: merged } = mergeRemote(snapshot, initialQueueState, new Set(), new Map());
    expect(ids(merged)).toEqual(["b", "a"]);
    expect(merged.items[1]?.tags).toEqual([{ name: "Music", color: "blue" }]);
    expect(merged.tagLibrary).toEqual([{ name: "Music", color: "blue" }]);
    expect(merged.autoPlayNext).toBe(true);
  });

  test("a video this device hasn't changed follows the server, including deletion", () => {
    const local = state([item("a", { title: "old" }), item("gone")], { currentId: "a" });
    const { state: merged } = mergeRemote(
      remote([row(item("a", { title: "new" }), 1)]),
      local,
      new Set(),
      new Map(),
    );
    expect(merged.items.map((i) => i.title)).toEqual(["new"]);
    expect(merged.currentId).toBe("a");
  });

  test("this device's unconfirmed changes win: edits, additions, deletions and moves", () => {
    const a = item("a");
    const b = item("b");
    const c = item("c");
    const local = state([item("new"), item("b", { watched: true }), a]);
    const pending = new Set([videoKey("new"), videoKey("b"), videoKey("c"), videoKey("a")]);
    const localPositions = new Map([
      ["new", 0.5],
      ["b", 2],
      ["a", 3],
    ]);
    const { state: merged } = mergeRemote(
      remote([row(a, 1), row(b, 2), row(c, 3)]),
      local,
      pending,
      localPositions,
    );
    expect(ids(merged)).toEqual(["new", "b", "a"]); // c deleted here, a moved to the end
    expect(merged.items[1]?.watched).toBe(true);
  });

  test("the same YouTube video added on two devices keeps the server's copy", () => {
    const serverCopy = item("server", { videoId: "dQw4w9WgXcQ" });
    const localCopy = item("local", {
      videoId: "dQw4w9WgXcQ",
      tags: [{ name: "Music", color: "red" }],
    });
    const { state: merged, settled } = mergeRemote(
      remote([row(serverCopy, 1)]),
      state([localCopy]),
      new Set([videoKey("local"), videoTagKey("local", "Music")]),
      new Map(),
    );
    expect(ids(merged)).toEqual(["server"]);
    expect(settled.sort()).toEqual([videoKey("local"), videoTagKey("local", "Music")].sort());
  });

  test("pending tag, history and settings changes override the server", async () => {
    const tagId = await tagIdFor(USER, "Old");
    const local = state([], {
      tagLibrary: [{ name: "Fresh", color: "green" }],
      history: [{ videoId: "v2", url: "u2", title: "Two", addedAt: T0 + 1 }],
      autoPlayNext: false,
    });
    const snapshot = remote([], {
      tags: new Map([
        [
          tagId,
          { id: tagId, user_id: USER, name: "Old", color: "red", created_at: "", updated_at: "" },
        ],
      ]),
      history: new Map([
        [
          "v1",
          {
            user_id: USER,
            video_id: "v1",
            url: "u1",
            title: null,
            added_at: new Date(T0).toISOString(),
            updated_at: "",
          },
        ],
      ]),
      settings: { user_id: USER, auto_play_next: true, updated_at: "" },
    });
    const pending = new Set([
      tagKey("Old"),
      tagKey("Fresh"),
      historyKey("v1"),
      historyKey("v2"),
      SETTINGS_KEY,
    ]);
    const { state: merged } = mergeRemote(snapshot, local, pending, new Map());
    expect(merged.tagLibrary).toEqual([{ name: "Fresh", color: "green" }]);
    expect(merged.history.map((e) => e.videoId)).toEqual(["v2"]);
    expect(merged.autoPlayNext).toBe(false);
  });

  test("pending tag changes on a video apply on top of the server's tags", async () => {
    const a = item("a", { tags: [{ name: "Added", color: "green" }] });
    const keep = await tagIdFor(USER, "Keep");
    const gone = await tagIdFor(USER, "Gone");
    const tagRow = (id: string, name: string) => ({
      id,
      user_id: USER,
      name,
      color: "red" as const,
      created_at: "",
      updated_at: "",
    });
    const link = (tagId: string) => ({
      video_id: "a",
      tag_id: tagId,
      user_id: USER,
      created_at: "",
    });
    const snapshot = remote([row(a, 1)], {
      tags: new Map([
        [keep, tagRow(keep, "Keep")],
        [gone, tagRow(gone, "Gone")],
      ]),
      videoTags: new Map([
        [`a:${keep}`, link(keep)],
        [`a:${gone}`, link(gone)],
      ]),
    });
    const pending = new Set([videoTagKey("a", "Added"), videoTagKey("a", "Gone")]);
    const { state: merged } = mergeRemote(snapshot, state([a]), pending, new Map());
    expect(merged.items[0]?.tags.map((t) => t.name)).toEqual(["Added", "Keep"]);
  });
});

describe("unsyncedKeys", () => {
  test("uploads only what the account doesn't already have", () => {
    const shared = item("shared", { videoId: "dQw4w9WgXcQ" });
    const mine = item("mine", { tags: [{ name: "Music", color: "red" }] });
    const local = state([shared, mine], {
      tagLibrary: [{ name: "Music", color: "red" }],
      history: [{ videoId: "dQw4w9WgXcQ", url: "u", title: null, addedAt: T0 }],
    });
    const snapshot = remote([row(item("server", { videoId: "dQw4w9WgXcQ" }), 1)], {
      history: new Map([
        [
          "dQw4w9WgXcQ",
          {
            user_id: USER,
            video_id: "dQw4w9WgXcQ",
            url: "u",
            title: null,
            added_at: "",
            updated_at: "",
          },
        ],
      ]),
    });
    expect(unsyncedKeys(local, snapshot).sort()).toEqual(
      [videoKey("mine"), videoTagKey("mine", "Music"), tagKey("Music"), SETTINGS_KEY].sort(),
    );
  });
});

describe("tagIdFor", () => {
  test("is a stable UUID per user and name, ignoring case", async () => {
    const id = await tagIdFor(USER, "Music");
    expect(isUuid(id)).toBe(true);
    expect(await tagIdFor(USER, " music ")).toBe(id);
    expect(await tagIdFor("00000000-0000-0000-0000-0000000000bb", "Music")).not.toBe(id);
  });
});
