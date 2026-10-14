import { describe, expect, test } from "bun:test";

import { commentsErrorReason, parseCommentThreads } from "./youtube-comments.ts";

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
