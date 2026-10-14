import { describe, expect, test } from "bun:test";

import { parseQueueState, serializeBackup, serializeQueueState } from "./queue-persistence.ts";
import { initialQueueState, type QueueState } from "./queue-state.ts";

const NOW = 1_700_000_000_000;

const sample: QueueState = {
  items: [
    {
      id: "a",
      videoId: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Song",
      channelName: "Channel",
      duration: 212,
      thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
      tags: [{ name: "Music", color: "blue" }],
      watched: false,
      bookmarked: true,
      inQueue: true,
      addedAt: NOW,
      playbackSeconds: 30,
    },
  ],
  currentId: "a",
  tagLibrary: [{ name: "Music", color: "blue" }],
  history: [
    {
      videoId: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Song",
      addedAt: NOW,
    },
  ],
  autoPlayNext: true,
};

describe("parseQueueState", () => {
  test("round-trips what it saves", () => {
    expect(parseQueueState(serializeQueueState(sample), NOW)).toEqual(sample);
  });

  test("reads a backup file", () => {
    expect(parseQueueState(serializeBackup(sample, NOW), NOW)).toEqual(sample);
  });

  test("rejects anything that isn't Wateer data", () => {
    expect(parseQueueState("not json")).toBeNull();
    expect(parseQueueState("[]")).toBeNull();
    expect(parseQueueState('{"name":"package"}')).toBeNull();
  });

  test("drops malformed and duplicate items and fills in missing fields", () => {
    const raw = JSON.stringify({
      items: [
        { id: "a", videoId: "abc", tags: ["Music"] },
        { id: "b", videoId: "abc" },
        { videoId: "no-id" },
        null,
      ],
      currentId: "gone",
      historyBackfilled: true,
    });
    const parsed = parseQueueState(raw, NOW);
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.items[0]).toMatchObject({
      id: "a",
      url: "https://www.youtube.com/watch?v=abc",
      tags: [{ name: "Music", color: "red" }],
      inQueue: true,
      addedAt: NOW,
    });
    expect(parsed?.currentId).toBeNull();
    // Tags already on videos join the library.
    expect(parsed?.tagLibrary).toEqual([{ name: "Music", color: "red" }]);
  });

  test("seeds history from videos saved before history existed", () => {
    const raw = JSON.stringify({ items: sample.items });
    expect(parseQueueState(raw, NOW)?.history.map((e) => e.videoId)).toEqual(["dQw4w9WgXcQ"]);
  });

  test("an empty store parses to the initial state", () => {
    expect(parseQueueState('{"items":[]}', NOW)).toEqual(initialQueueState);
  });
});
