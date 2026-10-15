import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { createRateLimiter, createTtlCache } from "@/lib/api-guard";
import { extractYouTubeId } from "@/lib/youtube";
import {
  commentsErrorReason,
  parseCommentThreads,
  type CommentsPage,
} from "@/lib/youtube-comments";

export const fetchVideoMetadata = createServerFn({ method: "GET" })
  .validator((data) => z.string().url().parse(data))
  .handler(async ({ data: url }) => {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });

    if (!response.ok) {
      throw new Error(`Failed to fetch video metadata: ${response.status}`);
    }

    const json = (await response.json()) as {
      title?: string;
      author_name?: string;
    };
    return {
      title: json.title?.trim() ?? "",
      channelName: json.author_name?.trim() ?? "",
    };
  });

// The Data API calls below spend a daily quota on the server's key, and server
// functions are public endpoints. Cache what's been fetched, and cap how often any
// one client, and this instance as a whole, may reach Google.
const perClientLimit = createRateLimiter({ limit: 60, windowMs: 60_000 });
const instanceLimit = createRateLimiter({ limit: 600, windowMs: 60 * 60_000 });

function mayCallYouTubeApi(): boolean {
  // Vercel sets X-Forwarded-For itself, so it can be trusted there.
  const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
  return perClientLimit.take(ip) && instanceLimit.take("all");
}

/** Let Vercel's CDN answer repeats of this response without running the function. */
function cacheAtEdge(seconds: number) {
  setResponseHeader(
    "Cache-Control",
    `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 6}`,
  );
}

type VideoStats = { duration: number | null; commentCount: number | null };

const STATS_TTL_SECONDS = 6 * 60 * 60;
const statsCache = createTtlCache<VideoStats>({
  maxEntries: 2000,
  ttlMs: STATS_TTL_SECONDS * 1000,
});

/** Duration and comment count, from one Data API call. */
export const fetchVideoStats = createServerFn({ method: "GET" })
  .validator((data) => z.string().url().parse(data))
  .handler(async ({ data: url }): Promise<VideoStats> => {
    const empty: VideoStats = { duration: null, commentCount: null };
    const apiKey = process.env["YOUTUBE_API_KEY"];
    if (!apiKey) {
      return empty;
    }

    const videoId = extractYouTubeId(url);
    if (!videoId) {
      return empty;
    }

    const cached = statsCache.get(videoId);
    if (cached) {
      cacheAtEdge(STATS_TTL_SECONDS);
      return cached;
    }
    if (!mayCallYouTubeApi()) {
      return empty;
    }

    const endpoint = `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(videoId)}&part=contentDetails,statistics&key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint);

    if (!response.ok) {
      return empty;
    }

    const json = (await response.json()) as {
      items?: Array<{
        contentDetails?: { duration?: string };
        statistics?: { commentCount?: string };
      }>;
    };
    const video = json.items?.[0];
    const stats: VideoStats = {
      duration: parseIsoDuration(video?.contentDetails?.duration),
      // Absent when comments are turned off.
      commentCount: parseCount(video?.statistics?.commentCount),
    };
    statsCache.set(videoId, stats);
    cacheAtEdge(STATS_TTL_SECONDS);
    return stats;
  });

function parseIsoDuration(isoDuration: string | undefined): number | null {
  const match = isoDuration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return null;
  }

  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  return totalSeconds > 0 ? totalSeconds : null;
}

function parseCount(value: string | undefined): number | null {
  const count = value == null ? NaN : Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

const COMMENTS_PER_PAGE = 20;
const COMMENTS_TTL_SECONDS = 10 * 60;
const commentsCache = createTtlCache<CommentsPage>({
  maxEntries: 500,
  ttlMs: COMMENTS_TTL_SECONDS * 1000,
});

/** Answers that won't change by asking again soon are worth keeping. */
function isCacheable(page: CommentsPage) {
  return page.status === "ok" || page.reason === "disabled" || page.reason === "not-found";
}

export const fetchVideoComments = createServerFn({ method: "GET" })
  .validator((data) =>
    z
      .object({
        videoId: z.string().regex(/^[\w-]{11}$/),
        order: z.enum(["relevance", "time"]),
        pageToken: z.string().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<CommentsPage> => {
    const apiKey = process.env["YOUTUBE_API_KEY"];
    if (!apiKey) {
      return { status: "unavailable", reason: "no-api-key" };
    }

    const cacheKey = `${data.videoId}:${data.order}:${data.pageToken ?? ""}`;
    const cached = commentsCache.get(cacheKey);
    if (cached) {
      cacheAtEdge(COMMENTS_TTL_SECONDS);
      return cached;
    }
    if (!mayCallYouTubeApi()) {
      return { status: "unavailable", reason: "busy" };
    }

    const params = new URLSearchParams({
      part: "snippet",
      videoId: data.videoId,
      order: data.order,
      maxResults: String(COMMENTS_PER_PAGE),
      textFormat: "plainText",
      key: apiKey,
    });
    if (data.pageToken) params.set("pageToken", data.pageToken);

    const response = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?${params}`);
    const json = await response.json().catch(() => ({}));

    const page: CommentsPage = response.ok
      ? parseCommentThreads(json)
      : { status: "unavailable", reason: commentsErrorReason(json) };
    if (isCacheable(page)) {
      commentsCache.set(cacheKey, page);
      cacheAtEdge(COMMENTS_TTL_SECONDS);
    }
    return page;
  });
