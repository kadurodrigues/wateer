import * as React from "react";
import { Play } from "lucide-react";

import { buildYouTubeEmbedUrl } from "@/lib/youtube";

type YTPlayerStateEvent = { data: number };
type YTPlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo?: () => void;
  getPlayerState?: () => number;
};

/** Lets the rest of the page jump the player to a time, once the player is ready. */
export type SeekRef = React.MutableRefObject<((seconds: number) => void) | null>;

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          events?: {
            onReady?: () => void;
            onStateChange?: (event: YTPlayerStateEvent) => void;
          };
        },
      ) => YTPlayer;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const PROGRESS_INTERVAL_MS = 3000;
const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;

let apiPromise: Promise<void> | null = null;

function loadYouTubeIframeAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

function readCurrentTime(player: YTPlayer | null): number | null {
  if (!player) return null;
  try {
    const seconds = player.getCurrentTime();
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return seconds;
  } catch {
    return null;
  }
}

export function VideoPlayer({
  videoId,
  itemId = null,
  startSeconds = 0,
  onEnded,
  onProgress,
  seekRef,
}: {
  videoId: string | null;
  itemId?: string | null;
  startSeconds?: number;
  onEnded?: (() => void) | undefined;
  onProgress?: ((itemId: string, seconds: number) => void) | undefined;
  seekRef?: SeekRef | undefined;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const onEndedRef = React.useRef(onEnded);
  const onProgressRef = React.useRef(onProgress);
  const startSecondsRef = React.useRef(startSeconds);
  onEndedRef.current = onEnded;
  onProgressRef.current = onProgress;
  startSecondsRef.current = startSeconds;

  // Freeze resume offset for the current videoId so progress updates do not remount the iframe.
  const resumeForVideoRef = React.useRef<{ videoId: string | null; seconds: number }>({
    videoId: null,
    seconds: 0,
  });
  if (videoId !== resumeForVideoRef.current.videoId) {
    resumeForVideoRef.current = {
      videoId,
      seconds: Math.max(0, Math.floor(startSeconds)),
    };
  }
  const embedStartSeconds = resumeForVideoRef.current.seconds;

  React.useEffect(() => {
    if (!videoId || !itemId || !containerRef.current) return;

    let cancelled = false;
    let player: YTPlayer | null = null;
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    const progressItemId = itemId;

    const reportProgress = () => {
      const seconds = readCurrentTime(player);
      if (seconds == null) return;
      onProgressRef.current?.(progressItemId, seconds);
    };

    const clearProgressTimer = () => {
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    };

    const startProgressTimer = () => {
      if (progressTimer) return;
      progressTimer = setInterval(reportProgress, PROGRESS_INTERVAL_MS);
    };

    void loadYouTubeIframeAPI().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;
      const iframe = containerRef.current.querySelector("iframe");
      if (!iframe) return;

      player = new window.YT.Player(iframe, {
        events: {
          onReady: () => {
            if (cancelled || !player) return;
            const readyPlayer = player;
            if (seekRef) {
              seekRef.current = (seconds) => {
                try {
                  readyPlayer.seekTo(seconds, true);
                  readyPlayer.playVideo?.();
                } catch {
                  // the player may be mid-teardown when a video switches
                }
              };
            }
            const start = startSecondsRef.current;
            if (start > 0) {
              try {
                player.seekTo(start, true);
              } catch {
                // seek can fail if the player is not ready enough; start= URL is the fallback
              }
            }
          },
          onStateChange: (event) => {
            const ended = window.YT?.PlayerState?.ENDED ?? YT_ENDED;
            const playing = window.YT?.PlayerState?.PLAYING ?? YT_PLAYING;
            const paused = window.YT?.PlayerState?.PAUSED ?? YT_PAUSED;

            if (event.data === ended || event.data === YT_ENDED) {
              clearProgressTimer();
              onProgressRef.current?.(progressItemId, 0);
              onEndedRef.current?.();
              return;
            }

            if (event.data === playing || event.data === YT_PLAYING) {
              startProgressTimer();
              return;
            }

            if (event.data === paused || event.data === YT_PAUSED) {
              clearProgressTimer();
              reportProgress();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearProgressTimer();
      reportProgress();
      if (seekRef) seekRef.current = null;
      player?.destroy();
    };
  }, [videoId, itemId, seekRef]);

  if (!videoId) {
    return (
      <div className="relative w-full px-6 py-4">
        <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-stage">
          <div className="flex flex-col items-center gap-4 text-stage-foreground/70">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-stage-foreground/20 bg-stage-foreground/10 backdrop-blur-md">
              <Play className="ml-1 h-8 w-8 fill-current" />
            </div>
            <p className="text-sm font-medium">Add a video to start watching</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full px-6 py-4">
      <div className="aspect-video w-full overflow-hidden rounded-2xl shadow-2xl">
        <iframe
          key={videoId}
          src={buildYouTubeEmbedUrl(videoId, embedStartSeconds)}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}
