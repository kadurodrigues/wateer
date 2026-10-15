import { describe, expect, test } from "bun:test";

import { commentsErrorReason, parseCommentThreads, splitTimestamps } from "./youtube-comments.ts";

function thread(overrides: Record<string, unknown> = {}, replies = 3) {
  return {
    id: "thread-1",
    snippet: {
      totalReplyCount: replies,
      topLevelComment: {
        id: "comment-1",
        snippet: {
          authorDisplayName: "@someone",
          authorProfileImageUrl: "https://yt3.ggpht.com/avatar.jpg",
          authorChannelUrl: "http://www.youtube.com/@someone",
          textOriginal: "Great video at 1:23\nSecond line",
          likeCount: 42,
          publishedAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          ...overrides,
        },
      },
    },
  };
}

describe("parseCommentThreads", () => {
  test("maps a thread to a plain-text comment", () => {
    const page = parseCommentThreads({ items: [thread()], nextPageToken: "next" });
    expect(page).toEqual({
      status: "ok",
      nextPageToken: "next",
      comments: [
        {
          id: "thread-1",
          author: "@someone",
          authorAvatarUrl: "https://yt3.ggpht.com/avatar.jpg",
          authorChannelUrl: "https://www.youtube.com/@someone",
          text: "Great video at 1:23\nSecond line",
          likeCount: 42,
          replyCount: 3,
          publishedAt: Date.parse("2026-01-01T00:00:00Z"),
          edited: false,
        },
      ],
    });
  });

  test("marks comments updated after posting as edited", () => {
    const page = parseCommentThreads({ items: [thread({ updatedAt: "2026-02-01T00:00:00Z" })] });
    expect(page.status === "ok" && page.comments[0]?.edited).toBe(true);
  });

  test("drops links that don't point at YouTube", () => {
    const page = parseCommentThreads({
      items: [
        thread({
          authorChannelUrl: "javascript:alert(1)",
          authorProfileImageUrl: "http://insecure.example/a.jpg",
        }),
      ],
    });
    expect(page.status === "ok" && page.comments[0]).toMatchObject({
      authorChannelUrl: null,
      authorAvatarUrl: null,
    });
  });

  test("skips empty comments and has no next page at the end", () => {
    const page = parseCommentThreads({ items: [thread({ textOriginal: "  " })] });
    expect(page).toEqual({ status: "ok", comments: [], nextPageToken: null });
  });
});

describe("commentsErrorReason", () => {
  const error = (reason: string) => ({ error: { errors: [{ reason }] } });

  test("recognises the cases worth explaining", () => {
    expect(commentsErrorReason(error("commentsDisabled"))).toBe("disabled");
    expect(commentsErrorReason(error("videoNotFound"))).toBe("not-found");
    expect(commentsErrorReason(error("quotaExceeded"))).toBe("quota");
    expect(commentsErrorReason(error("backendError"))).toBe("error");
    expect(commentsErrorReason({})).toBe("error");
  });
});

describe("splitTimestamps", () => {
  test("turns timestamps into seekable segments", () => {
    expect(splitTimestamps("The drop at 2:31 and again at 1:02:05!")).toEqual([
      { type: "text", value: "The drop at " },
      { type: "time", value: "2:31", seconds: 151 },
      { type: "text", value: " and again at " },
      { type: "time", value: "1:02:05", seconds: 3725 },
      { type: "text", value: "!" },
    ]);
  });

  test("accepts a timestamp on its own or at the edges", () => {
    expect(splitTimestamps("0:45")).toEqual([{ type: "time", value: "0:45", seconds: 45 }]);
    expect(splitTimestamps("12:00 so good").map((s) => s.type)).toEqual(["time", "text"]);
  });

  test("leaves things that only look like times alone", () => {
    const plain = (text: string) => splitTimestamps(text).every((s) => s.type === "text");
    expect(plain("Score was 3:2")).toBe(true); // seconds need two digits
    expect(plain("at 1:75")).toBe(true); // not a valid second
    expect(plain("1:2:3:45")).toBe(true); // part of a longer run
    expect(plain("version 10:30:15:20")).toBe(true);
    expect(plain("1:75:00")).toBe(true); // minutes past 59 with an hour
  });

  test("keeps times past the end of the video as text", () => {
    expect(splitTimestamps("see 0:30 and 9:59", 120)).toEqual([
      { type: "text", value: "see " },
      { type: "time", value: "0:30", seconds: 30 },
      { type: "text", value: " and 9:59" },
    ]);
  });

  test("returns plain text unchanged", () => {
    expect(splitTimestamps("no times here")).toEqual([{ type: "text", value: "no times here" }]);
  });
});
