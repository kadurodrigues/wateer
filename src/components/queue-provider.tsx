import * as React from "react";
import { toast } from "sonner";

import { fetchVideoMetadata, fetchVideoStats } from "@/lib/youtube.functions";
import { buildYouTubeThumbnailUrl, buildYouTubeWatchUrl, parseYouTubeUrl } from "@/lib/youtube";
import {
  STORAGE_KEY,
  parseQueueState,
  serializeBackup,
  serializeQueueState,
} from "@/lib/queue-persistence";
import {
  initialQueueState,
  isInQueue,
  matchesSection,
  queueReducer,
  type HistoryEntry,
  type ItemSnapshot,
  type QueueAction,
  type QueueItem,
  type ReorderSection,
} from "@/lib/queue-state";
import { mergeTagSources, type QueueTag } from "@/lib/tags";
import type { SyncStatus } from "@/lib/sync/engine";
import { useQueueSync } from "@/components/use-queue-sync";

export type { HistoryEntry, QueueItem, ReorderSection } from "@/lib/queue-state";

export type SidebarTab = "queue" | "bookmarks";

type QueueContextValue = {
  items: QueueItem[];
  currentId: string | null;
  loaded: boolean;
  autoPlayNext: boolean;
  setAutoPlayNext: (value: boolean) => void;
  finishVideo: (id: string) => void;
  currentItem: QueueItem | null;
  unwatched: QueueItem[];
  watched: QueueItem[];
  bookmarked: QueueItem[];
  /** Every saved tag, whether or not a video currently uses it. */
  allTags: QueueTag[];
  /** Only the tags currently applied to a bookmarked video. */
  usedTags: QueueTag[];
  addTagToLibrary: (tag: QueueTag) => void;
  deleteTag: (name: string) => void;
  countTagUsage: (name: string) => number;
  history: HistoryEntry[];
  addItem: (url: string) => Promise<void>;
  removeItem: (id: string) => void;
  setCurrent: (id: string) => void;
  toggleWatched: (id: string) => void;
  reorder: (
    sourceId: string,
    targetId: string,
    section: ReorderSection,
    position?: "before" | "after",
  ) => void;
  updateTags: (id: string, tags: QueueTag[]) => void;
  updatePlayback: (id: string, seconds: number) => void;
  toggleBookmark: (id: string) => void;
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;
  clearWatched: () => void;
  clearHistory: () => void;
  readdFromHistory: (videoId: string) => Promise<void>;
  /** Everything Wateer stores, as a JSON backup file's contents. */
  exportBackup: () => string;
  /** Replace everything with a backup's contents. False if it isn't a Wateer backup. */
  importBackup: (json: string) => boolean;
  /** Sync with the signed-in account; null while signed out (local-only). */
  syncStatus: SyncStatus | null;
};

const QUEUE_CONTEXT_KEY = Symbol.for("watch-later.queue-context");

type QueueContextRegistry = typeof globalThis & {
  [QUEUE_CONTEXT_KEY]?: React.Context<QueueContextValue | null>;
};

const contextRegistry = globalThis as QueueContextRegistry;
const QueueContext =
  contextRegistry[QUEUE_CONTEXT_KEY] ?? React.createContext<QueueContextValue | null>(null);

contextRegistry[QUEUE_CONTEXT_KEY] = QueueContext;

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function snapshotsOf(items: QueueItem[], match: (item: QueueItem) => boolean): ItemSnapshot[] {
  return items.flatMap((item, index) => (match(item) ? [{ item, index }] : []));
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export function QueueProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(queueReducer, initialQueueState);
  const [sidebarTab, setSidebarTab] = React.useState<SidebarTab>("queue");
  const [loaded, setLoaded] = React.useState(false);
  const stateRef = React.useRef(state);
  stateRef.current = state;
  // Set when state arrives from another tab, so this tab doesn't echo it straight back.
  const skipNextSaveRef = React.useRef(false);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const saved = raw ? parseQueueState(raw) : null;
      if (saved) dispatch({ type: "replace", state: saved });
    } catch {
      // ignore unreadable storage
    }
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    if (!loaded) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeQueueState(state));
    } catch {
      // ignore quota / private-mode failures
    }
  }, [state, loaded]);

  // Without this, two open tabs each save their own copy and the last write wins.
  React.useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY || event.newValue == null) return;
      const incoming = parseQueueState(event.newValue);
      if (!incoming) return;
      skipNextSaveRef.current = true;
      dispatch({ type: "sync", state: incoming });
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const { items, currentId, tagLibrary, history, autoPlayNext } = state;

  const unwatched = React.useMemo(
    () => items.filter((i) => matchesSection(i, "unwatched")),
    [items],
  );
  const watched = React.useMemo(() => items.filter((i) => matchesSection(i, "watched")), [items]);
  const bookmarked = React.useMemo(() => items.filter((i) => i.bookmarked), [items]);
  const usedTags = React.useMemo(() => {
    const seen = new Map<string, QueueTag>();
    for (const item of bookmarked) {
      for (const tag of item.tags) {
        const key = tag.name.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.set(key, tag);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [bookmarked]);

  const allTags = React.useMemo(
    () => mergeTagSources(tagLibrary, usedTags),
    [tagLibrary, usedTags],
  );

  const currentItem = React.useMemo(
    () => items.find((i) => i.id === currentId) ?? null,
    [items, currentId],
  );

  // Follow the video that starts playing, but never yank the tab out from under
  // someone who just bookmarked the video they are already watching.
  const syncedTabForIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!currentItem || currentItem.id === syncedTabForIdRef.current) return;
    syncedTabForIdRef.current = currentItem.id;
    setSidebarTab(currentItem.bookmarked ? "bookmarks" : "queue");
  }, [currentItem]);

  /** Run a destructive action and offer to put the affected items back. */
  const dispatchUndoable = React.useCallback(
    (action: QueueAction, snapshots: ItemSnapshot[], message: string) => {
      const before = stateRef.current;
      const after = queueReducer(before, action);
      dispatch(action);
      if (snapshots.length === 0) return;
      toast(message, {
        action: {
          label: "Undo",
          onClick: () =>
            dispatch({
              type: "restore-items",
              snapshots,
              currentId: before.currentId,
              currentIdAfter: after.currentId,
            }),
        },
      });
    },
    [],
  );

  const loadDetails = React.useCallback(async (videoId: string, url: string) => {
    try {
      const [{ title, channelName }, { duration, commentCount }] = await Promise.all([
        fetchVideoMetadata({ data: url }),
        fetchVideoStats({ data: url }),
      ]);
      dispatch({
        type: "details-loaded",
        videoId,
        details: { title, channelName, duration, commentCount },
      });
    } catch {
      dispatch({ type: "details-failed", videoId });
    }
  }, []);

  // Videos added before comment counts were stored pick theirs up the first time they play.
  const backfilledIdsRef = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!currentItem || currentItem.commentCount !== null) return;
    if (backfilledIdsRef.current.has(currentItem.id)) return;
    backfilledIdsRef.current.add(currentItem.id);
    void loadDetails(currentItem.videoId, currentItem.url);
  }, [currentItem, loadDetails]);

  const enqueue = React.useCallback(
    async (videoId: string, url: string, title: string | null, startSeconds = 0) => {
      const { items, currentId } = stateRef.current;
      const existing = items.find((i) => i.videoId === videoId);
      if (existing) {
        if (existing.id === currentId) {
          toast("This video is already playing.");
          return;
        }
        const where = existing.bookmarked
          ? "your bookmarks"
          : existing.watched
            ? "your watched videos"
            : "your queue";
        toast(`This video is already in ${where}.`, {
          action: {
            label: "Play",
            onClick: () => dispatch({ type: "set-current", id: existing.id }),
          },
        });
        return;
      }
      dispatch({
        type: "add",
        item: {
          id: generateId(),
          videoId,
          url,
          title,
          channelName: null,
          duration: null,
          commentCount: null,
          thumbnail: buildYouTubeThumbnailUrl(videoId),
          tags: [],
          watched: false,
          bookmarked: false,
          inQueue: true,
          addedAt: Date.now(),
          playbackSeconds: startSeconds,
        },
      });
      await loadDetails(videoId, url);
    },
    [loadDetails],
  );

  const addItem = React.useCallback(
    async (url: string) => {
      const parsed = parseYouTubeUrl(url);
      if (!parsed) {
        toast.error("That doesn't look like a valid YouTube URL.");
        return;
      }
      await enqueue(
        parsed.videoId,
        buildYouTubeWatchUrl(parsed.videoId),
        null,
        parsed.startSeconds,
      );
    },
    [enqueue],
  );

  const readdFromHistory = React.useCallback(
    async (videoId: string) => {
      const entry = stateRef.current.history.find((e) => e.videoId === videoId);
      if (!entry) return;
      await enqueue(entry.videoId, entry.url, entry.title);
    },
    [enqueue],
  );

  const removeItem = React.useCallback(
    (id: string) => {
      const snapshots = snapshotsOf(stateRef.current.items, (i) => i.id === id);
      const title = snapshots[0]?.item.title;
      dispatchUndoable(
        { type: "remove", id },
        snapshots,
        title ? `Removed “${title}”` : "Removed video",
      );
    },
    [dispatchUndoable],
  );

  const toggleBookmark = React.useCallback(
    (id: string) => {
      // Un-bookmarking a video already cleared out of the queue deletes it outright.
      const snapshots = snapshotsOf(
        stateRef.current.items,
        (i) => i.id === id && i.bookmarked && !isInQueue(i),
      );
      dispatchUndoable({ type: "toggle-bookmark", id }, snapshots, "Bookmark removed");
    },
    [dispatchUndoable],
  );

  const clearWatched = React.useCallback(() => {
    const snapshots = snapshotsOf(
      stateRef.current.items,
      (i) => i.watched && (!i.bookmarked || isInQueue(i)),
    );
    dispatchUndoable(
      { type: "clear-watched" },
      snapshots,
      `Cleared ${plural(snapshots.length, "watched video")}`,
    );
  }, [dispatchUndoable]);

  const clearHistory = React.useCallback(() => {
    const entries = stateRef.current.history;
    dispatch({ type: "clear-history" });
    if (entries.length === 0) return;
    toast(`Cleared ${plural(entries.length, "history entry", "history entries")}`, {
      action: {
        label: "Undo",
        onClick: () => dispatch({ type: "restore-history", entries }),
      },
    });
  }, []);

  const exportBackup = React.useCallback(() => serializeBackup(stateRef.current), []);

  const importBackup = React.useCallback((json: string) => {
    const incoming = parseQueueState(json);
    if (!incoming) return false;
    const before = stateRef.current;
    dispatch({ type: "replace", state: incoming });
    toast(`Imported ${plural(incoming.items.length, "video")}`, {
      action: {
        label: "Undo",
        onClick: () => dispatch({ type: "replace", state: before }),
      },
    });
    return true;
  }, []);

  const setAutoPlayNext = React.useCallback(
    (value: boolean) => dispatch({ type: "set-auto-play", value }),
    [],
  );
  const finishVideo = React.useCallback((id: string) => dispatch({ type: "finish", id }), []);
  const setCurrent = React.useCallback((id: string) => dispatch({ type: "set-current", id }), []);
  const toggleWatched = React.useCallback(
    (id: string) => dispatch({ type: "toggle-watched", id }),
    [],
  );
  const reorder = React.useCallback(
    (sourceId: string, targetId: string, section: ReorderSection, position?: "before" | "after") =>
      dispatch({ type: "reorder", sourceId, targetId, section, position }),
    [],
  );
  const updateTags = React.useCallback(
    (id: string, tags: QueueTag[]) => dispatch({ type: "update-tags", id, tags }),
    [],
  );
  const updatePlayback = React.useCallback(
    (id: string, seconds: number) => dispatch({ type: "update-playback", id, seconds }),
    [],
  );
  const addTagToLibrary = React.useCallback(
    (tag: QueueTag) => dispatch({ type: "create-tag", tag }),
    [],
  );
  /** Deleting a tag removes it from the library and detaches it from every video. */
  const deleteTag = React.useCallback((name: string) => dispatch({ type: "delete-tag", name }), []);
  const countTagUsage = React.useCallback((name: string) => {
    const key = name.trim().toLowerCase();
    return stateRef.current.items.filter((i) =>
      i.tags.some((tag) => tag.name.toLowerCase() === key),
    ).length;
  }, []);

  const syncStatus = useQueueSync({ state, stateRef, dispatch, loaded });

  const value = React.useMemo(
    () => ({
      items,
      currentId,
      loaded,
      autoPlayNext,
      setAutoPlayNext,
      finishVideo,
      currentItem,
      unwatched,
      watched,
      bookmarked,
      allTags,
      usedTags,
      addTagToLibrary,
      deleteTag,
      countTagUsage,
      history,
      addItem,
      removeItem,
      setCurrent,
      toggleWatched,
      toggleBookmark,
      sidebarTab,
      setSidebarTab,
      reorder,
      updateTags,
      updatePlayback,
      clearWatched,
      clearHistory,
      readdFromHistory,
      exportBackup,
      importBackup,
      syncStatus,
    }),
    [
      items,
      currentId,
      loaded,
      autoPlayNext,
      setAutoPlayNext,
      finishVideo,
      currentItem,
      unwatched,
      watched,
      bookmarked,
      allTags,
      usedTags,
      addTagToLibrary,
      deleteTag,
      countTagUsage,
      history,
      addItem,
      removeItem,
      setCurrent,
      toggleWatched,
      toggleBookmark,
      sidebarTab,
      setSidebarTab,
      reorder,
      updateTags,
      updatePlayback,
      clearWatched,
      clearHistory,
      readdFromHistory,
      exportBackup,
      importBackup,
      syncStatus,
    ],
  );

  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function useQueue() {
  const context = React.useContext(QueueContext);
  if (!context) {
    throw new Error("useQueue must be used within a QueueProvider");
  }
  return context;
}
