import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { extractYouTubeId } from "@/lib/youtube";

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

export const fetchVideoDuration = createServerFn({ method: "GET" })
  .validator((data) => z.string().url().parse(data))
  .handler(async ({ data: url }) => {
    const apiKey = process.env["YOUTUBE_API_KEY"];
    if (!apiKey) {
      return { duration: null };
    }

    const videoId = extractYouTubeId(url);
    if (!videoId) {
      return { duration: null };
    }

    const endpoint = `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(videoId)}&part=contentDetails&key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint);

    if (!response.ok) {
      return { duration: null };
    }

    const json = (await response.json()) as {
      items?: Array<{ contentDetails?: { duration?: string } }>;
    };
    const isoDuration = json.items?.[0]?.contentDetails?.duration;
    if (!isoDuration) {
      return { duration: null };
    }

    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) {
      return { duration: null };
    }

    const hours = parseInt(match[1] ?? "0", 10);
    const minutes = parseInt(match[2] ?? "0", 10);
    const seconds = parseInt(match[3] ?? "0", 10);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;

    return { duration: totalSeconds > 0 ? totalSeconds : null };
  });
