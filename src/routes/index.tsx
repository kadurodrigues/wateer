import { createFileRoute } from "@tanstack/react-router";
import { Bookmark, BookmarkCheck, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AddVideoForm } from "@/components/add-video-form";
import { QueueMobileDrawer } from "@/components/queue-mobile-drawer";
import { QueuePanel } from "@/components/queue-panel";
import { useQueue } from "@/components/queue-provider";
import { VideoPlayer } from "@/components/video-player";
import { WateerLogo } from "@/components/wateer-logo";
import { getTagColor } from "@/lib/tags";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Wateer" },
      {
        name: "description",
        content: "A personal YouTube watch-later queue with a player and a reorderable list.",
      },
      { property: "og:title", content: "Wateer" },
      {
        property: "og:description",
        content: "A personal YouTube watch-later queue with a player and a reorderable list.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function App() {
  const { currentItem, loaded, finishVideo, updatePlayback, toggleBookmark, updateTags } =
    useQueue();

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen justify-center bg-muted">
      <div className="mx-auto flex h-screen w-full max-w-[1200px] flex-col lg:flex-row lg:p-4">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-background shadow-xl lg:rounded-3xl">
          <header className="border-b border-border p-6">
            {/* One gap-3 rhythm across logo → input → button. */}
            <div className="flex max-w-3xl items-center gap-3">
              <WateerLogo />
              <AddVideoForm className="flex-1" />
            </div>
          </header>

          <VideoPlayer
            videoId={currentItem?.videoId ?? null}
            itemId={currentItem?.id ?? null}
            startSeconds={currentItem?.playbackSeconds ?? 0}
            onEnded={currentItem ? () => finishVideo(currentItem.id) : undefined}
            onProgress={updatePlayback}
          />

          {currentItem && (
            <section className="px-6 pb-4 lg:pb-5">
              <div className="flex items-start gap-4">
                <h1 className="min-w-0 flex-1 text-xl font-bold tracking-tight text-foreground lg:text-2xl">
                  {currentItem.title}
                </h1>
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-pressed={currentItem.bookmarked}
                        aria-label={
                          currentItem.bookmarked ? "Remove from Bookmark" : "Add to Bookmark"
                        }
                        onClick={() => toggleBookmark(currentItem.id)}
                        className="size-9 shrink-0 rounded-full"
                      >
                        {currentItem.bookmarked ? (
                          <BookmarkCheck className="fill-brand text-brand" />
                        ) : (
                          <Bookmark />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{currentItem.bookmarked ? "Remove from Bookmark" : "Add to Bookmark"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate">{currentItem.channelName ?? "Unknown channel"}</span>
                <span className="text-border">|</span>
                <span className="shrink-0">Added {formatRelativeDate(currentItem.addedAt)}</span>
              </div>
              {currentItem.bookmarked && currentItem.tags.length > 0 && (
                <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
                  {currentItem.tags.map((tag) => {
                    const tagColor = getTagColor(tag.color);
                    return (
                      <Badge
                        key={tag.name}
                        variant="outline"
                        className={cn("gap-1 pe-1 text-xs font-medium", tagColor.badge)}
                      >
                        {tag.name}
                        <button
                          type="button"
                          onClick={() =>
                            updateTags(
                              currentItem.id,
                              currentItem.tags.filter((existing) => existing.name !== tag.name),
                            )
                          }
                          className="rounded-sm p-0.5 opacity-70 transition-colors hover:bg-black/5 hover:opacity-100"
                          aria-label={`Remove tag ${tag.name} from this video`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </main>

        <aside className="hidden w-full shrink-0 overflow-hidden rounded-none bg-background shadow-xl lg:ml-4 lg:block lg:w-96 lg:rounded-3xl lg:border lg:border-border">
          <QueuePanel />
        </aside>

        <QueueMobileDrawer />
      </div>
    </div>
  );
}

function Index() {
  return <App />;
}

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
