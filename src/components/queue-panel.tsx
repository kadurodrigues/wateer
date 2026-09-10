import * as React from "react";
import { Bookmark, ListVideo, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueueItemCard } from "@/components/queue-item";
import { QueueHistory } from "@/components/queue-history";
import { QueueSettings } from "@/components/queue-settings";
import { useQueue } from "@/components/queue-provider";
import type { QueueItem, SidebarTab } from "@/components/queue-provider";
import {
  resolveDragDirection,
  resolveDropIndicator,
  shiftYForDrop,
  type DragDirection,
} from "@/lib/queue-drop";
import { getTagColor } from "@/lib/tags";
import { cn } from "@/lib/utils";

const ALL_TAGS_FILTER = "__all__";

export function QueuePanel() {
  const {
    unwatched,
    watched,
    bookmarked,
    allTags,
    currentId,
    setCurrent,
    removeItem,
    toggleWatched,
    toggleBookmark,
    reorder,
    clearWatched,
    sidebarTab,
    setSidebarTab,
  } = useQueue();

  const [tagFilter, setTagFilter] = React.useState(ALL_TAGS_FILTER);

  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [cardHeight, setCardHeight] = React.useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = React.useState<{
    id: string | null;
    position: "before" | "after" | null;
  }>({ id: null, position: null });
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const draggingIdRef = React.useRef<string | null>(null);
  const grabYRef = React.useRef(0);
  const lastYRef = React.useRef(0);
  const directionRef = React.useRef<DragDirection | null>(null);
  const rectsRef = React.useRef<
    Array<{ id: string; top: number; bottom: number }>
  >([]);

  const allItems = React.useMemo(
    () => [...unwatched, ...watched],
    [unwatched, watched],
  );
  const bookmarkedUnwatched = React.useMemo(() => {
    const items = bookmarked.filter((i) => !i.watched);
    if (tagFilter === ALL_TAGS_FILTER) return items;
    return items.filter((i) => i.tags.some((tag) => tag.name === tagFilter));
  }, [bookmarked, tagFilter]);
  const bookmarkedWatched = React.useMemo(() => {
    const items = bookmarked.filter((i) => i.watched);
    if (tagFilter === ALL_TAGS_FILTER) return items;
    return items.filter((i) => i.tags.some((tag) => tag.name === tagFilter));
  }, [bookmarked, tagFilter]);
  const clearableWatchedCount = watched.length;
  const filteredBookmarkCount =
    bookmarkedUnwatched.length + bookmarkedWatched.length;

  React.useEffect(() => {
    if (tagFilter !== ALL_TAGS_FILTER && !allTags.some((tag) => tag.name === tagFilter)) {
      setTagFilter(ALL_TAGS_FILTER);
    }
  }, [allTags, tagFilter]);

  const setIndicator = React.useCallback(
    (id: string | null, position: "before" | "after" | null) => {
      setDropIndicator((prev) =>
        prev.id === id && prev.position === position ? prev : { id, position },
      );
    },
    [],
  );

  function handleDragStart(id: string, startY: number) {
    draggingIdRef.current = id;
    grabYRef.current = startY;
    lastYRef.current = startY;
    directionRef.current = null;
    setDraggingId(id);
    setIndicator(null, null);

    const draggedNode = listRef.current?.querySelector<HTMLElement>(
      `[data-queue-id="${id}"]`,
    );
    if (draggedNode) {
      setCardHeight(draggedNode.getBoundingClientRect().height);
    }

    const nodes = listRef.current?.querySelectorAll<HTMLElement>("[data-queue-id]");
    rectsRef.current = Array.from(nodes ?? []).map((node) => {
      const rect = node.getBoundingClientRect();
      return { id: node.dataset["queueId"]!, top: rect.top, bottom: rect.bottom };
    });
  }

  function handleDragEnd() {
    draggingIdRef.current = null;
    directionRef.current = null;
    setDraggingId(null);
    setCardHeight(null);
    setIndicator(null, null);
    rectsRef.current = [];
  }

  function handleListDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const draggingId = draggingIdRef.current;
    if (!draggingId) return;

    const source = allItems.find((i) => i.id === draggingId);
    if (!source) return;

    directionRef.current = resolveDragDirection({
      y: e.clientY,
      lastY: lastYRef.current,
      previous: directionRef.current,
    });
    lastYRef.current = e.clientY;

    const sectionIds = new Set(
      (source.watched ? watched : unwatched).map((i) => i.id),
    );
    const rects = rectsRef.current.filter((r) => sectionIds.has(r.id));
    const next = resolveDropIndicator({
      y: e.clientY,
      grabY: grabYRef.current,
      draggingId,
      rects,
      direction: directionRef.current,
    });

    if (!next) {
      setIndicator(null, null);
      return;
    }

    setIndicator(next.id, next.position);
  }

  function handleBookmarksDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const draggingId = draggingIdRef.current;
    if (!draggingId) return;

    directionRef.current = resolveDragDirection({
      y: e.clientY,
      lastY: lastYRef.current,
      previous: directionRef.current,
    });
    lastYRef.current = e.clientY;

    const source = bookmarked.find((i) => i.id === draggingId);
    if (!source) return;

    const sectionIds = new Set(
      (source.watched ? bookmarkedWatched : bookmarkedUnwatched).map((i) => i.id),
    );
    const rects = rectsRef.current.filter((r) => sectionIds.has(r.id));
    const next = resolveDropIndicator({
      y: e.clientY,
      grabY: grabYRef.current,
      draggingId,
      rects,
      direction: directionRef.current,
    });

    if (!next) {
      setIndicator(null, null);
      return;
    }

    setIndicator(next.id, next.position);
  }

  function handleListDragLeave(e: React.DragEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (next && listRef.current?.contains(next)) return;
    setIndicator(null, null);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const targetId = dropIndicator.id;
    if (draggingId && targetId && draggingId !== targetId) {
      const source =
        sidebarTab === "bookmarks"
          ? bookmarked.find((i) => i.id === draggingId)
          : allItems.find((i) => i.id === draggingId);
      if (source) {
        const section =
          sidebarTab === "bookmarks"
            ? source.watched
              ? "bookmarked-watched"
              : "bookmarked-unwatched"
            : source.watched
              ? "watched"
              : "unwatched";
        reorder(draggingId, targetId, section, dropIndicator.position ?? undefined);
      }
    }
    handleDragEnd();
  }

  function shiftYForItem(id: string) {
    if (
      !draggingId ||
      id === draggingId ||
      dropIndicator.id !== id ||
      !dropIndicator.position ||
      !cardHeight
    ) {
      return 0;
    }
    return shiftYForDrop(dropIndicator.position, cardHeight);
  }

  function renderCard(item: QueueItem) {
    return (
      <QueueItemCard
        key={item.id}
        item={item}
        isActive={item.id === currentId}
        isDragging={item.id === draggingId}
        dragActive={Boolean(draggingId)}
        shiftY={shiftYForItem(item.id)}
        showDropSlot={dropIndicator.id === item.id}
        overflowMenu={sidebarTab === "bookmarks"}
        onPlay={() => setCurrent(item.id)}
        onRemove={() => removeItem(item.id)}
        onToggleWatched={() => toggleWatched(item.id)}
        onToggleBookmark={() => toggleBookmark(item.id)}
        onDragStart={(id, startY) => handleDragStart(id, startY)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        onDragEnd={handleDragEnd}
      />
    );
  }

  const tabCount = sidebarTab === "recent" ? unwatched.length : bookmarked.length;

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="border-b border-border p-6 pb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-bold tracking-tight text-foreground">
            <ListVideo className="h-5 w-5" />
            Up Next
          </h2>
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {tabCount} {tabCount === 1 ? "video" : "videos"}
            </span>
            <div className="flex items-center gap-1">
              <QueueHistory />
              <QueueSettings />
            </div>
          </div>
        </div>

        <Tabs
          value={sidebarTab}
          onValueChange={(v) => setSidebarTab(v as SidebarTab)}
          className="mt-3"
        >
          <TabsList className="h-auto w-full rounded-xl p-1.5">
            <TabsTrigger value="recent" className="h-10 flex-1 gap-1.5 py-2 text-xs">
              <ListVideo className="h-3.5 w-3.5" />
              Recent
              {unwatched.length > 0 && (
                <span className="ml-0.5 text-[10px] text-muted-foreground">
                  {unwatched.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="bookmarks" className="h-10 flex-1 gap-1.5 py-2 text-xs">
              <Bookmark className="h-3.5 w-3.5" />
              Bookmarks
              {bookmarked.length > 0 && (
                <span className="ml-0.5 text-[10px] text-muted-foreground">
                  {bookmarked.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="min-w-0 flex-1 px-6 py-4">
        {sidebarTab === "recent" ? (
          <div
            ref={listRef}
            role="list"
            aria-label="Up next"
            className="min-w-0 space-y-3"
            onDragOver={handleListDragOver}
            onDragLeave={handleListDragLeave}
            onDrop={handleDrop}
          >
            {unwatched.map(renderCard)}

            {watched.length > 0 && (
              <div className="flex items-center gap-3 py-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Watched
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}

            {watched.map(renderCard)}

            {unwatched.length === 0 && watched.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">Your queue is empty.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste a YouTube URL above to get started.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div
            ref={listRef}
            role="list"
            aria-label="Bookmarks"
            className="min-w-0 space-y-3"
            onDragOver={handleBookmarksDragOver}
            onDragLeave={handleListDragLeave}
            onDrop={handleDrop}
          >
            {allTags.length > 0 && (
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger className="h-9 w-full bg-background text-xs shadow-none border-2 mt-2 mb-6 focus:ring-0 focus:ring-offset-0 data-[state=open]:ring-0">
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TAGS_FILTER}>All tags</SelectItem>
                  {allTags.map((tag) => (
                    <SelectItem key={tag.name} value={tag.name}>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-2.5 w-2.5 shrink-0 rounded-full",
                            getTagColor(tag.color).dot,
                          )}
                        />
                        {tag.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {bookmarkedUnwatched.map(renderCard)}

            {bookmarkedWatched.length > 0 && (
              <div className="flex items-center gap-3 py-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Watched
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}

            {bookmarkedWatched.map(renderCard)}

            {bookmarked.length === 0 && (
              <div className="py-12 text-center">
                <Bookmark className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">No bookmarks yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bookmark videos to save them for later.
                </p>
              </div>
            )}

            {bookmarked.length > 0 && filteredBookmarkCount === 0 && (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No bookmarks with this tag.
                </p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {sidebarTab === "recent" && (
        <div className="flex items-center gap-2 border-t border-border p-6">
          <Button
            variant="brand"
            className="flex-1 text-xs font-bold"
            onClick={clearWatched}
            disabled={clearableWatchedCount === 0}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Clear Watched
          </Button>
        </div>
      )}
    </div>
  );
}
