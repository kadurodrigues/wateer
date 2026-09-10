import { createFileRoute } from "@tanstack/react-router";

import { AddVideoForm } from "@/components/add-video-form";
import { QueueMobileDrawer } from "@/components/queue-mobile-drawer";
import { QueuePanel } from "@/components/queue-panel";
import { useQueue } from "@/components/queue-provider";
import { VideoPlayer } from "@/components/video-player";
import { VideoTagEditor } from "@/components/video-tag-editor";
import { WateerLogo } from "@/components/wateer-logo";

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
  const { currentItem, loaded, finishVideo, allTags, updateTags, updatePlayback } = useQueue();

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
              <h1 className="text-xl font-bold tracking-tight text-foreground lg:text-2xl">
                {currentItem.title}
              </h1>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate">{currentItem.channelName ?? "Unknown channel"}</span>
                <span className="text-border">|</span>
                <span className="shrink-0">Added {formatRelativeDate(currentItem.addedAt)}</span>
              </div>
              {currentItem.bookmarked && (
                <VideoTagEditor
                  tags={currentItem.tags}
                  allTags={allTags}
                  onChange={(tags) => updateTags(currentItem.id, tags)}
                />
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
