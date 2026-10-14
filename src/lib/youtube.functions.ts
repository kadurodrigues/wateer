import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

/** Duration and comment count, from one Data API call. */
export const fetchVideoStats = createServerFn({ method: "GET" })
  .validator((data) => z.string().url().parse(data))
  .handler(async ({ data: url }) => {
    const empty = { duration: null, commentCount: null };
    const apiKey = process.env["YOUTUBE_API_KEY"];
    if (!apiKey) {
      return empty;
    }

    const videoId = extractYouTubeId(url);
    if (!videoId) {
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
    return {
      duration: parseIsoDuration(video?.contentDetails?.duration),
      // Absent when comments are turned off.
      commentCount: parseCount(video?.statistics?.commentCount),
    };
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

    if (!response.ok) {
      return { status: "unavailable", reason: commentsErrorReason(json) };
    }
    return parseCommentThreads(json);
  });
