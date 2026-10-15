import { describe, expect, test } from "bun:test";

import { parseTimestamp, parseYouTubeUrl } from "./youtube.ts";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeUrl", () => {
  test.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PL123&index=2`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=tracking`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
    `youtube.com/watch?v=${ID}`,
    `youtu.be/${ID}`,
    `  https://youtu.be/${ID}  `,
  ])("reads the ID from %s", (url) => {
    expect(parseYouTubeUrl(url)?.videoId).toBe(ID);
  });

  test.each([
    `https://notyoutube.com/watch?v=${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    `https://evil.example/?next=youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=short`,
    `https://www.youtube.com/watch?v=${ID}extra`,
    `https://www.youtube.com/@channel`,
    `javascript:alert("${ID}")`,
    "",
    "not a link",
  ])("rejects %s", (url) => {
    expect(parseYouTubeUrl(url)).toBeNull();
  });

  test("keeps the start time from t=, start= or the hash", () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=90`)?.startSeconds).toBe(90);
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)?.startSeconds).toBe(90);
    expect(parseYouTubeUrl(`https://www.youtube.com/embed/${ID}?start=45`)?.startSeconds).toBe(45);
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}#t=2m`)?.startSeconds).toBe(120);
    expect(parseYouTubeUrl(`https://youtu.be/${ID}`)?.startSeconds).toBe(0);
  });
});

describe("parseTimestamp", () => {
  test("reads seconds in YouTube's formats", () => {
    expect(parseTimestamp("75")).toBe(75);
    expect(parseTimestamp("75s")).toBe(75);
    expect(parseTimestamp("1h2m3s")).toBe(3723);
    expect(parseTimestamp("2m")).toBe(120);
  });

  test("treats anything else as no start time", () => {
    expect(parseTimestamp(null)).toBe(0);
    expect(parseTimestamp("")).toBe(0);
    expect(parseTimestamp("soon")).toBe(0);
  });
});
