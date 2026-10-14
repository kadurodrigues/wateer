import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, MessageSquare, MessagesSquare, ThumbsUp } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount, formatRelativeDate } from "@/lib/format";
import { fetchVideoComments } from "@/lib/youtube.functions";
import type { CommentOrder, CommentsUnavailableReason, VideoComment } from "@/lib/youtube-comments";
import { cn } from "@/lib/utils";

const ORDERS: Array<{ value: CommentOrder; label: string }> = [
  { value: "relevance", label: "Top" },
  { value: "time", label: "Newest" },
];

const UNAVAILABLE_MESSAGES: Record<CommentsUnavailableReason, string> = {
  "no-api-key": "Comments need a YouTube API key on the server.",
  disabled: "Comments are turned off for this video.",
  "not-found": "This video couldn't be found on YouTube.",
  quota: "The YouTube API quota is used up for today. Try again tomorrow.",
  error: "Comments couldn't be loaded.",
};

/**
 * Read-only comments for the playing video, fetched only once opened.
 * Mount with `key={videoId}` so each video starts collapsed.
 */
export function VideoComments({
  videoId,
  commentCount,
}: {
  videoId: string;
  commentCount: number | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [order, setOrder] = React.useState<CommentOrder>("relevance");
  const panelId = React.useId();

  const query = useInfiniteQuery({
    queryKey: ["video-comments", videoId, order],
    queryFn: ({ pageParam }) =>
      fetchVideoComments({
        data: pageParam ? { videoId, order, pageToken: pageParam } : { videoId, order },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.status === "ok" ? last.nextPageToken : null),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const firstPage = query.data?.pages[0];
  const comments = React.useMemo(
    () => query.data?.pages.flatMap((page) => (page.status === "ok" ? page.comments : [])) ?? [],
    [query.data],
  );
  const unavailable =
    firstPage?.status === "unavailable"
      ? UNAVAILABLE_MESSAGES[firstPage.reason]
      : query.isError
        ? UNAVAILABLE_MESSAGES.error
        : null;
  const canRetry =
    query.isError || (firstPage?.status === "unavailable" && firstPage.reason === "error");

  return (
    // Fills the space under the video info and scrolls on its own, so the video stays in view.
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="gap-1.5 self-start rounded-full"
      >
        <MessageSquare />
        {open ? "Hide comments" : "Comments"}
        {commentCount != null && (
          <span className="tabular-nums text-muted-foreground">{formatCount(commentCount)}</span>
        )}
        <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
      </Button>

      {open && (
        <section id={panelId} aria-label="Comments" className="mt-4 flex min-h-48 flex-1 flex-col">
          <div
            className="mb-3 flex shrink-0 items-center gap-1"
            role="group"
            aria-label="Sort comments"
          >
            {ORDERS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={order === option.value ? "secondary" : "ghost"}
                aria-pressed={order === option.value}
                onClick={() => setOrder(option.value)}
                className="h-7 rounded-full px-3 text-xs"
              >
                {option.label}
              </Button>
            ))}
          </div>

          {/* relative: sr-only labels are absolute, and would otherwise stretch the window. */}
          <div className="relative -mx-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {query.isPending ? (
              <CommentSkeletons />
            ) : unavailable ? (
              <div className="rounded-2xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
                <p>{unavailable}</p>
                {canRetry && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => void query.refetch()}
                    className="mt-1 h-auto p-0"
                  >
                    Try again
                  </Button>
                )}
              </div>
            ) : comments.length === 0 ? (
              <p className="rounded-2xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
                No comments yet.
              </p>
            ) : (
              <>
                <ul className="space-y-5">
                  {comments.map((comment) => (
                    <CommentRow key={comment.id} comment={comment} videoId={videoId} />
                  ))}
                </ul>
                {query.hasNextPage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={query.isFetchingNextPage}
                    onClick={() => void query.fetchNextPage()}
                    className="mt-5 w-full rounded-full"
                  >
                    {query.isFetchingNextPage ? <Loader2 className="animate-spin" /> : "Load more"}
                  </Button>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

const LONG_COMMENT_CHARS = 300;
const LONG_COMMENT_LINES = 4;

function CommentRow({ comment, videoId }: { comment: VideoComment; videoId: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const isLong =
    comment.text.length > LONG_COMMENT_CHARS ||
    comment.text.split("\n").length > LONG_COMMENT_LINES;

  const author = comment.authorChannelUrl ? (
    <a
      href={comment.authorChannelUrl}
      target="_blank"
      rel="noreferrer"
      className="truncate font-semibold text-foreground hover:underline"
    >
      {comment.author}
    </a>
  ) : (
    <span className="truncate font-semibold text-foreground">{comment.author}</span>
  );

  return (
    <li className="flex gap-3">
      <Avatar className="size-9 shrink-0">
        {comment.authorAvatarUrl && (
          <AvatarImage src={comment.authorAvatarUrl} alt="" referrerPolicy="no-referrer" />
        )}
        <AvatarFallback className="text-xs">
          {comment.author.replace(/^@/, "").charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2 text-xs">
          {author}
          <span className="shrink-0 text-muted-foreground">
            {formatRelativeDate(comment.publishedAt)}
            {comment.edited && " (edited)"}
          </span>
        </div>

        <p
          className={cn(
            "mt-1 whitespace-pre-line break-words text-sm text-foreground",
            isLong && !expanded && "line-clamp-4",
          )}
        >
          {comment.text}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}

        <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 tabular-nums">
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Likes:</span>
            {formatCount(comment.likeCount)}
          </span>
          {comment.replyCount > 0 && (
            // Replies aren't loaded here; they open on YouTube with the comment highlighted.
            <a
              href={`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&lc=${encodeURIComponent(comment.id)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground hover:underline"
            >
              <MessagesSquare className="h-3.5 w-3.5" aria-hidden="true" />
              {comment.replyCount === 1 ? "1 reply" : `${formatCount(comment.replyCount)} replies`}
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

function CommentSkeletons() {
  return (
    <ul className="space-y-5" aria-label="Loading comments">
      {[0, 1, 2].map((key) => (
        <li key={key} className="flex gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
