export type CommentOrder = "relevance" | "time";

export type VideoComment = {
  id: string;
  author: string;
  authorAvatarUrl: string | null;
  authorChannelUrl: string | null;
  /** Plain text as the author wrote it. Never render YouTube's HTML `textDisplay`. */
  text: string;
  likeCount: number;
  replyCount: number;
  publishedAt: number;
  edited: boolean;
};

export type CommentsUnavailableReason = "no-api-key" | "disabled" | "not-found" | "quota" | "error";

export type CommentsPage =
  | { status: "ok"; comments: VideoComment[]; nextPageToken: string | null }
  | { status: "unavailable"; reason: CommentsUnavailableReason };

type ApiCommentSnippet = {
  authorDisplayName?: string;
  authorProfileImageUrl?: string;
  authorChannelUrl?: string;
  textOriginal?: string;
  likeCount?: number;
  publishedAt?: string;
  updatedAt?: string;
};

type ApiCommentThreads = {
  nextPageToken?: string;
  items?: Array<{
    id?: string;
    snippet?: {
      totalReplyCount?: number;
      topLevelComment?: { id?: string; snippet?: ApiCommentSnippet };
    };
  }>;
  error?: { errors?: Array<{ reason?: string }> };
};

/** Only link to YouTube itself; the API's URLs are http:// and come from user profiles. */
function safeYouTubeUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.hostname !== "www.youtube.com" && url.hostname !== "youtube.com") return null;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

function safeImageUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseCommentThreads(json: ApiCommentThreads): CommentsPage {
  const comments: VideoComment[] = [];
  for (const thread of json.items ?? []) {
    const top = thread.snippet?.topLevelComment;
    const snippet = top?.snippet;
    const id = thread.id ?? top?.id;
    const text = snippet?.textOriginal?.trim();
    if (!id || !snippet || !text) continue;
    const publishedAt = Date.parse(snippet.publishedAt ?? "");
    const updatedAt = Date.parse(snippet.updatedAt ?? "");
    comments.push({
      id,
      author: snippet.authorDisplayName?.trim() || "Unknown",
      authorAvatarUrl: safeImageUrl(snippet.authorProfileImageUrl),
      authorChannelUrl: safeYouTubeUrl(snippet.authorChannelUrl),
      text,
      likeCount: snippet.likeCount ?? 0,
      replyCount: thread.snippet?.totalReplyCount ?? 0,
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : 0,
      edited: Number.isFinite(updatedAt) && updatedAt > publishedAt,
    });
  }
  return { status: "ok", comments, nextPageToken: json.nextPageToken ?? null };
}

export function commentsErrorReason(json: ApiCommentThreads): CommentsUnavailableReason {
  const reasons = json.error?.errors?.map((e) => e.reason) ?? [];
  if (reasons.includes("commentsDisabled")) return "disabled";
  if (reasons.includes("videoNotFound")) return "not-found";
  if (reasons.includes("quotaExceeded") || reasons.includes("dailyLimitExceeded")) return "quota";
  return "error";
}
