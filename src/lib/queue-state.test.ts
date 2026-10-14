import { describe, expect, test } from "bun:test";

import {
  initialQueueState,
  queueReducer,
  type QueueAction,
  type QueueItem,
  type QueueState,
} from "./queue-state.ts";

function item(id: string, overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id,
    videoId: `vid-${id}`,
    url: `https://www.youtube.com/watch?v=vid-${id}`,
    title: `Video ${id}`,
    channelName: null,
    duration: null,
    commentCount: null,
    thumbnail: "",
    tags: [],
    watched: false,
    bookmarked: false,
    inQueue: true,
    addedAt: 0,
    playbackSeconds: 0,
    ...overrides,
  };
}

function state(items: QueueItem[], overrides: Partial<QueueState> = {}): QueueState {
  return { ...initialQueueState, items, currentId: items[0]?.id ?? null, ...overrides };
}

const ids = (s: QueueState) => s.items.map((i) => i.id);

describe("finish", () => {
  test("auto-play moves to the next queued video, skipping unwatched bookmarks", () => {
    const s = state([item("a"), item("b", { bookmarked: true }), item("c")], {
      autoPlayNext: true,
    });
    const next = queueReducer(s, { type: "finish", id: "a" });
    expect(next.currentId).toBe("c");
    expect(next.items.find((i) => i.id === "a")?.watched).toBe(true);
  });

  test("a finished bookmark auto-plays the next unwatched bookmark", () => {
    const s = state([item("a", { bookmarked: true }), item("b"), item("c", { bookmarked: true })], {
      autoPlayNext: true,
    });
    expect(queueReducer(s, { type: "finish", id: "a" }).currentId).toBe("c");
  });

  test("stays on the finished video when nothing is left, instead of replaying a watched one", () => {
    const s = state([item("a"), item("b", { watched: true })], { autoPlayNext: true });
    expect(queueReducer(s, { type: "finish", id: "a" }).currentId).toBe("a");
  });

  test("without auto-play the current video stays put", () => {
    const s = state([item("a"), item("b")]);
    expect(queueReducer(s, { type: "finish", id: "a" }).currentId).toBe("a");
  });

  test("clears the resume point", () => {
    const s = state([item("a", { playbackSeconds: 90 })]);
    expect(queueReducer(s, { type: "finish", id: "a" }).items[0]?.playbackSeconds).toBe(0);
  });
});

describe("update-playback", () => {
  test("records whole seconds", () => {
    const s = state([item("a")]);
    expect(
      queueReducer(s, { type: "update-playback", id: "a", seconds: 12.9 }).items[0]
        ?.playbackSeconds,
    ).toBe(12);
  });

  test("ignores the end time the player reports for a watched video", () => {
    const s = state([item("a", { watched: true })]);
    expect(queueReducer(s, { type: "update-playback", id: "a", seconds: 300 })).toBe(s);
  });
});

describe("toggle-watched", () => {
  test("marking the current video watched moves on within its own list", () => {
    const s = state([item("a"), item("b", { bookmarked: true }), item("c")]);
    expect(queueReducer(s, { type: "toggle-watched", id: "a" }).currentId).toBe("c");
  });

  test("unwatching a cleared bookmark keeps it out of the queue", () => {
    const s = state([item("a", { bookmarked: true, watched: true, inQueue: false })]);
    const next = queueReducer(s, { type: "toggle-watched", id: "a" });
    expect(next.items[0]).toMatchObject({ watched: false, inQueue: false });
  });
});

describe("toggle-bookmark", () => {
  test("bookmarks a queued video", () => {
    const s = state([item("a")]);
    expect(queueReducer(s, { type: "toggle-bookmark", id: "a" }).items[0]?.bookmarked).toBe(true);
  });

  test("un-bookmarking a cleared bookmark deletes it", () => {
    const s = state([item("a"), item("b", { bookmarked: true, watched: true, inQueue: false })]);
    expect(ids(queueReducer(s, { type: "toggle-bookmark", id: "b" }))).toEqual(["a"]);
  });
});

describe("remove", () => {
  test("removing the current video plays the next queued one", () => {
    const s = state([item("a"), item("b", { bookmarked: true }), item("c")]);
    const next = queueReducer(s, { type: "remove", id: "a" });
    expect(ids(next)).toEqual(["b", "c"]);
    expect(next.currentId).toBe("c");
  });
});

describe("clear-watched", () => {
  test("drops watched queue videos and archives watched bookmarks", () => {
    const s = state(
      [item("a"), item("b", { watched: true }), item("c", { watched: true, bookmarked: true })],
      { currentId: "a" },
    );
    const next = queueReducer(s, { type: "clear-watched" });
    expect(ids(next)).toEqual(["a", "c"]);
    expect(next.items[1]?.inQueue).toBe(false);
    expect(next.currentId).toBe("a");
  });
});

describe("restore-items", () => {
  function undo(before: QueueState, action: QueueAction, snapshotIds: string[]) {
    const after = queueReducer(before, action);
    const snapshots = before.items.flatMap((i, index) =>
      snapshotIds.includes(i.id) ? [{ item: i, index }] : [],
    );
    return {
      after,
      restore: (s: QueueState) =>
        queueReducer(s, {
          type: "restore-items",
          snapshots,
          currentId: before.currentId,
          currentIdAfter: after.currentId,
        }),
    };
  }

  test("puts a removed video back where it was and plays it again", () => {
    const before = state([item("a"), item("b"), item("c")], { currentId: "b" });
    const { after, restore } = undo(before, { type: "remove", id: "b" }, ["b"]);
    const restored = restore(after);
    expect(ids(restored)).toEqual(["a", "b", "c"]);
    expect(restored.currentId).toBe("b");
  });

  test("doesn't take over playback if another video was picked since", () => {
    const before = state([item("a"), item("b"), item("c")], { currentId: "b" });
    const { after, restore } = undo(before, { type: "remove", id: "b" }, ["b"]);
    expect(after.currentId).toBe("a");
    const moved = queueReducer(after, { type: "set-current", id: "c" });
    expect(restore(moved).currentId).toBe("c");
  });

  test("undoes clear-watched, including archived bookmarks", () => {
    const before = state([
      item("a"),
      item("b", { watched: true }),
      item("c", { watched: true, bookmarked: true }),
    ]);
    const { after, restore } = undo(before, { type: "clear-watched" }, ["b", "c"]);
    expect(restore(after).items).toEqual(before.items);
  });

  test("skips a video that has been re-added in the meantime", () => {
    const before = state([item("a"), item("b")]);
    const { after, restore } = undo(before, { type: "remove", id: "b" }, ["b"]);
    const readded = queueReducer(after, { type: "add", item: item("b2", { videoId: "vid-b" }) });
    expect(ids(restore(readded))).toEqual(["a", "b2"]);
  });
});

describe("history", () => {
  test("adding a video records it once", () => {
    let s = queueReducer(initialQueueState, { type: "add", item: item("a") });
    s = queueReducer(s, { type: "remove", id: "a" });
    s = queueReducer(s, { type: "add", item: item("a2", { videoId: "vid-a" }) });
    expect(s.history.map((e) => e.videoId)).toEqual(["vid-a"]);
  });

  test("restore-history brings cleared entries back", () => {
    const s = queueReducer(initialQueueState, { type: "add", item: item("a") });
    const cleared = queueReducer(s, { type: "clear-history" });
    expect(cleared.history).toEqual([]);
    expect(queueReducer(cleared, { type: "restore-history", entries: s.history }).history).toEqual(
      s.history,
    );
  });

  test("details keep a known comment count when a later lookup has none", () => {
    const details = { title: "T", channelName: "C", duration: 60 };
    let s = queueReducer(initialQueueState, { type: "add", item: item("a") });
    s = queueReducer(s, {
      type: "details-loaded",
      videoId: "vid-a",
      details: { ...details, commentCount: 12 },
    });
    expect(s.items[0]?.commentCount).toBe(12);
    s = queueReducer(s, {
      type: "details-loaded",
      videoId: "vid-a",
      details: { ...details, commentCount: null },
    });
    expect(s.items[0]?.commentCount).toBe(12);
  });

  test("a failed lookup names the video in both the queue and history", () => {
    let s = queueReducer(initialQueueState, { type: "add", item: item("a", { title: null }) });
    s = queueReducer(s, { type: "details-failed", videoId: "vid-a" });
    expect(s.items[0]?.title).toBe("Untitled video");
    expect(s.history[0]?.title).toBe("Untitled video");
  });
});

describe("sync", () => {
  test("adopts another tab's data but keeps this tab's current video", () => {
    const local = state([item("a"), item("b")], { currentId: "b" });
    const remote = state([item("a"), item("b"), item("c")], { currentId: "c" });
    const next = queueReducer(local, { type: "sync", state: remote });
    expect(ids(next)).toEqual(["a", "b", "c"]);
    expect(next.currentId).toBe("b");
  });

  test("follows the other tab when this tab's video was removed there", () => {
    const local = state([item("a"), item("b")], { currentId: "b" });
    const remote = state([item("a")], { currentId: "a" });
    expect(queueReducer(local, { type: "sync", state: remote }).currentId).toBe("a");
  });
});

describe("delete-tag", () => {
  test("removes the tag from the library and every video, ignoring case", () => {
    const s = state([item("a", { bookmarked: true, tags: [{ name: "Music", color: "red" }] })], {
      tagLibrary: [{ name: "Music", color: "red" }],
    });
    const next = queueReducer(s, { type: "delete-tag", name: "music" });
    expect(next.tagLibrary).toEqual([]);
    expect(next.items[0]?.tags).toEqual([]);
  });
});
