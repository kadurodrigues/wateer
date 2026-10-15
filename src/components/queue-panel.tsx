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
import { sectionOf } from "@/lib/queue-state";
import { getTagColor } from "@/lib/tags";
import { cn } from "@/lib/utils";

const ALL_TAGS_FILTER = "__all__";
const AUTO_SCROLL_EDGE_PX = 56;
const AUTO_SCROLL_MAX_SPEED = 14;

function hasTag(item: QueueItem, name: string) {
  const key = name.toLowerCase();
  return item.tags.some((tag) => tag.name.toLowerCase() === key);
}

export function QueuePanel() {
  const {
    unwatched,
    watched,
    bookmarked,
    usedTags,
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
  const rectsRef = React.useRef<Array<{ id: string; top: number; bottom: number }>>([]);

  const allItems = React.useMemo(() => [...unwatched, ...watched], [unwatched, watched]);
  const bookmarkedUnwatched = React.useMemo(() => {
    const items = bookmarked.filter((i) => !i.watched);
    if (tagFilter === ALL_TAGS_FILTER) return items;
    return items.filter((i) => hasTag(i, tagFilter));
  }, [bookmarked, tagFilter]);
  const bookmarkedWatched = React.useMemo(() => {
    const items = bookmarked.filter((i) => i.watched);
    if (tagFilter === ALL_TAGS_FILTER) return items;
    return items.filter((i) => hasTag(i, tagFilter));
  }, [bookmarked, tagFilter]);
  const clearableWatchedCount = watched.length;
  const filteredBookmarkCount = bookmarkedUnwatched.length + bookmarkedWatched.length;

  React.useEffect(() => {
    if (
      tagFilter !== ALL_TAGS_FILTER &&
      !usedTags.some((tag) => tag.name.toLowerCase() === tagFilter.toLowerCase())
    ) {
      setTagFilter(ALL_TAGS_FILTER);
    }
  }, [usedTags, tagFilter]);

  const dropIndicatorRef = React.useRef(dropIndicator);
  const setIndicator = React.useCallback(
    (id: string | null, position: "before" | "after" | null) => {
      const prev = dropIndicatorRef.current;
      if (prev.id === id && prev.position === position) return;
      dropIndicatorRef.current = { id, position };
      setDropIndicator(dropIndicatorRef.current);
    },
    [],
  );

  /** The list an item is shown in, as rendered (bookmarks respect the tag filter). */
  function visibleListOf(item: QueueItem): QueueItem[] {
    switch (sectionOf(item)) {
      case "unwatched":
        return unwatched;
      case "watched":
        return watched;
      case "bookmarked-unwatched":
        return bookmarkedUnwatched;
      case "bookmarked-watched":
        return bookmarkedWatched;
    }
  }

  function findItem(id: string) {
    return allItems.find((i) => i.id === id) ?? bookmarked.find((i) => i.id === id);
  }

  function handleDragStart(id: string, startY: number) {
    draggingIdRef.current = id;
    grabYRef.current = startY;
    lastYRef.current = startY;
    directionRef.current = null;
    setDraggingId(id);
    setIndicator(null, null);

    const draggedNode = listRef.current?.querySelector<HTMLElement>(`[data-queue-id="${id}"]`);
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

  /** Point the drop slot at whatever is under `y`, in the coordinates the drag started in. */
  function updateIndicator(y: number) {
    const draggingId = draggingIdRef.current;
    if (!draggingId) return;
    const source = findItem(draggingId);
    if (!source) return;

    directionRef.current = resolveDragDirection({
      y,
      lastY: lastYRef.current,
      previous: directionRef.current,
    });
    lastYRef.current = y;

    const sectionIds = new Set(visibleListOf(source).map((i) => i.id));
    const rects = rectsRef.current.filter((r) => sectionIds.has(r.id));
    const next = resolveDropIndicator({
      y,
      grabY: grabYRef.current,
      draggingId,
      rects,
      direction: directionRef.current,
    });
    setIndicator(next?.id ?? null, next?.position ?? null);
  }

  function commitDrop() {
    const draggingId = draggingIdRef.current;
    const { id: targetId, position } = dropIndicatorRef.current;
    const source = draggingId ? findItem(draggingId) : undefined;
    if (source && targetId && source.id !== targetId) {
      reorder(source.id, targetId, sectionOf(source), position ?? undefined);
    }
    handleDragEnd();
  }

  // Window listeners outlive the render that added them; route them to the latest handlers.
  const latest = React.useRef({ updateIndicator, commitDrop, handleDragEnd });
  latest.current = { updateIndicator, commitDrop, handleDragEnd };

  function handleListDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    updateIndicator(e.clientY);
  }

  function handleListDragLeave(e: React.DragEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (next && listRef.current?.contains(next)) return;
    setIndicator(null, null);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    commitDrop();
  }

  // Touch and pen drag from the handle. HTML5 drag-and-drop doesn't fire for touch,
  // so follow the pointer by hand, reusing the same drop logic as the mouse.
  const [pointerOffset, setPointerOffset] = React.useState<number | null>(null);
  const stopPointerDragRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => stopPointerDragRef.current?.(), []);

  function startPointerDrag(id: string, event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" || draggingIdRef.current) return;
    event.preventDefault();

    const pointerId = event.pointerId;
    const startY = event.clientY;
    const viewport = listRef.current?.closest<HTMLElement>("[data-radix-scroll-area-viewport]");
    const startScroll = viewport?.scrollTop ?? 0;
    let clientY = startY;
    // The rects were measured before any scrolling; shift the pointer to match them.
    const contentY = () => clientY + ((viewport?.scrollTop ?? startScroll) - startScroll);
    const update = () => {
      const y = contentY();
      latest.current.updateIndicator(y);
      setPointerOffset(y - startY);
    };

    handleDragStart(id, startY);
    setPointerOffset(0);

    let frame = requestAnimationFrame(function autoScroll() {
      frame = requestAnimationFrame(autoScroll);
      if (!viewport) return;
      const { top, bottom } = viewport.getBoundingClientRect();
      const edge = AUTO_SCROLL_EDGE_PX;
      const speed =
        clientY < top + edge
          ? -Math.ceil(((top + edge - clientY) / edge) * AUTO_SCROLL_MAX_SPEED)
          : clientY > bottom - edge
            ? Math.ceil(((clientY - (bottom - edge)) / edge) * AUTO_SCROLL_MAX_SPEED)
            : 0;
      if (!speed) return;
      const before = viewport.scrollTop;
      viewport.scrollTop += speed;
      if (viewport.scrollTop !== before) update();
    });

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      clientY = e.clientY;
      update();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      stop();
      latest.current.commitDrop();
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      stop();
      latest.current.handleDragEnd();
    };
    function stop() {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      stopPointerDragRef.current = null;
      setPointerOffset(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    stopPointerDragRef.current = stop;
  }

  // Keyboard: arrow keys on a card's handle move it one place among the visible cards.
  const [announcement, setAnnouncement] = React.useState("");
  const refocusHandleIdRef = React.useRef<string | null>(null);

  function moveWithKeyboard(item: QueueItem, offset: -1 | 1) {
    const list = visibleListOf(item);
    const index = list.findIndex((i) => i.id === item.id);
    const neighbour = list[index + offset];
    if (!neighbour) {
      setAnnouncement(offset < 0 ? "Already at the top." : "Already at the bottom.");
      return;
    }
    refocusHandleIdRef.current = item.id;
    reorder(item.id, neighbour.id, sectionOf(item), offset < 0 ? "before" : "after");
    setAnnouncement(
      `${item.title ?? "Video"} moved to position ${index + offset + 1} of ${list.length}.`,
    );
  }

  // Moving a node in the DOM drops its focus; hand it back to the moved card's handle.
  React.useLayoutEffect(() => {
    const id = refocusHandleIdRef.current;
    if (!id) return;
    refocusHandleIdRef.current = null;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-queue-id="${CSS.escape(id)}"] [data-reorder-handle]`)
      ?.focus();
  });

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
    const lifted = item.id === draggingId && pointerOffset != null;
    return (
      <QueueItemCard
        key={item.id}
        item={item}
        isActive={item.id === currentId}
        isDragging={item.id === draggingId}
        dragActive={Boolean(draggingId)}
        shiftY={lifted ? pointerOffset : shiftYForItem(item.id)}
        lifted={lifted}
        showDropSlot={dropIndicator.id === item.id}
        overflowMenu={sidebarTab === "bookmarks"}
        onPlay={() => setCurrent(item.id)}
        onRemove={() => removeItem(item.id)}
        onToggleWatched={() => toggleWatched(item.id)}
        onToggleBookmark={() => toggleBookmark(item.id)}
        onDragStart={(id, startY) => {
          // A touch drag is already moving this card; don't let the browser start another.
          if (draggingIdRef.current) return false;
          handleDragStart(id, startY);
          return true;
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        onDragEnd={handleDragEnd}
        onHandlePointerDown={(e) => startPointerDrag(item.id, e)}
        onHandleMove={(offset) => moveWithKeyboard(item, offset)}
      />
    );
  }

  const tabCount = sidebarTab === "recent" ? unwatched.length : bookmarked.length;

  return (
    <div className="relative flex h-full min-w-0 flex-col bg-background">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
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
                <span className="ml-0.5 text-[10px] text-muted-foreground">{unwatched.length}</span>
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
            onDragOver={handleListDragOver}
            onDragLeave={handleListDragLeave}
            onDrop={handleDrop}
          >
            {usedTags.length > 0 && (
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger className="h-9 w-full bg-background text-xs shadow-none border-2 mt-2 mb-6 focus:ring-0 focus:ring-offset-0 data-[state=open]:ring-0">
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TAGS_FILTER}>All tags</SelectItem>
                  {usedTags.map((tag) => (
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
                <p className="text-sm text-muted-foreground">No bookmarks with this tag.</p>
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
