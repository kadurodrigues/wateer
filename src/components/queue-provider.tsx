import * as React from "react";
import { toast } from "sonner";

import {
  fetchVideoDuration,
  fetchVideoMetadata,
} from "@/lib/youtube.functions";
import {
  buildYouTubeEmbedUrl,
  buildYouTubeThumbnailUrl,
  extractYouTubeId,
} from "@/lib/youtube";
import { reorderMatching } from "@/lib/queue-order";
import { normalizeTags, type QueueTag } from "@/lib/tags";

export type QueueItem = {
  id: string;
  videoId: string;
  url: string;
  title: string | null;
  channelName: string | null;
  duration: number | null;
  thumbnail: string;
  note: string;
  tags: QueueTag[];
  watched: boolean;
  bookmarked: boolean;
  inQueue: boolean;
  addedAt: number;
  playbackSeconds: number;
};

export type HistoryEntry = {
  videoId: string;
  url: string;
  title: string | null;
  addedAt: number;
};

type QueueState = {
  items: QueueItem[];
  currentId: string | null;
};

export type SidebarTab = "recent" | "bookmarks";

export type ReorderSection =
  | "unwatched"
  | "watched"
  | "bookmarked-unwatched"
  | "bookmarked-watched";

type QueueContextValue = QueueState & {
  loaded: boolean;
  autoPlayNext: boolean;
  setAutoPlayNext: (value: boolean) => void;
  finishVideo: (id: string) => void;
  currentItem: QueueItem | null;
  unwatched: QueueItem[];
  watched: QueueItem[];
  bookmarked: QueueItem[];
  allTags: QueueTag[];
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
  updateNote: (id: string, note: string) => void;
  updateTags: (id: string, tags: QueueTag[]) => void;
  updatePlayback: (id: string, seconds: number) => void;
  toggleBookmark: (id: string) => void;
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;
  clearWatched: () => void;
  clearHistory: () => void;
  readdFromHistory: (videoId: string) => Promise<void>;
  playNext: () => void;
  playPrevious: () => void;
};

const QUEUE_CONTEXT_KEY = Symbol.for("watch-later.queue-context");

type QueueContextRegistry = typeof globalThis & {
  [QUEUE_CONTEXT_KEY]?: React.Context<QueueContextValue | null>;
};

const contextRegistry = globalThis as QueueContextRegistry;
const QueueContext =
  contextRegistry[QUEUE_CONTEXT_KEY] ?? React.createContext<QueueContextValue | null>(null);

contextRegistry[QUEUE_CONTEXT_KEY] = QueueContext;

const STORAGE_KEY = "yt-queue-v1";

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function isInQueue(item: QueueItem) {
  return item.inQueue !== false;
}

function matchesReorderSection(item: QueueItem, section: ReorderSection) {
  switch (section) {
    case "unwatched":
      return !item.watched && !item.bookmarked && isInQueue(item);
    case "watched":
      return item.watched && !item.bookmarked && isInQueue(item);
    case "bookmarked-unwatched":
      return item.bookmarked && !item.watched;
    case "bookmarked-watched":
      return item.bookmarked && item.watched;
  }
}

function normalizeHistory(entries: unknown): HistoryEntry[] {
  if (!Array.isArray(entries)) return [];
  const seen = new Set<string>();
  const result: HistoryEntry[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const videoId = String((entry as HistoryEntry).videoId ?? "").trim();
    const url = String((entry as HistoryEntry).url ?? "").trim();
    if (!videoId || !url || seen.has(videoId)) continue;
    seen.add(videoId);
    const titleRaw = (entry as HistoryEntry).title;
    const title =
      typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : null;
    const addedAt =
      typeof (entry as HistoryEntry).addedAt === "number"
        ? (entry as HistoryEntry).addedAt
        : Date.now();
    result.push({ videoId, url, title, addedAt });
  }
  return result.sort((a, b) => b.addedAt - a.addedAt);
}

/** Merge queue items into history so existing Recent / Watched / Bookmarks appear. */
function mergeHistoryWithItems(
  existing: HistoryEntry[],
  items: Array<Pick<QueueItem, "videoId" | "url" | "title" | "addedAt">>,
): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>();
  for (const entry of existing) {
    byId.set(entry.videoId, entry);
  }
  for (const item of items) {
    const videoId = item.videoId?.trim();
    const url = item.url?.trim();
    if (!videoId || !url) continue;
    const prev = byId.get(videoId);
    if (!prev) {
      byId.set(videoId, {
        videoId,
        url,
        title: item.title ?? null,
        addedAt: typeof item.addedAt === "number" ? item.addedAt : Date.now(),
      });
      continue;
    }
    if (!prev.title && item.title) {
      byId.set(videoId, { ...prev, title: item.title });
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.addedAt - a.addedAt);
}

export function QueueProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<QueueState>({ items: [], currentId: null });
  const [autoPlayNext, setAutoPlayNext] = React.useState(false);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [historyBackfilled, setHistoryBackfilled] = React.useState(false);
  const [sidebarTab, setSidebarTab] = React.useState<SidebarTab>("recent");
  const [loaded, setLoaded] = React.useState(false);
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const historyRef = React.useRef(history);
  historyRef.current = history;

  React.useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<QueueState> & {
          autoPlayNext?: boolean;
          history?: unknown;
          historyBackfilled?: boolean;
        };
        if (Array.isArray(parsed.items)) {
          const items = parsed.items.map((item) => ({
            ...item,
            tags: normalizeTags(item.tags),
            playbackSeconds:
              typeof item.playbackSeconds === "number" && item.playbackSeconds > 0
                ? item.playbackSeconds
                : 0,
          }));
          setState({
            items,
            currentId: parsed.currentId ?? null,
          });
          const existingHistory = normalizeHistory(parsed.history);
          setHistory(
            parsed.historyBackfilled
              ? existingHistory
              : mergeHistoryWithItems(existingHistory, items),
          );
        } else {
          setHistory(normalizeHistory(parsed.history));
        }
        if (typeof parsed.autoPlayNext === "boolean") {
          setAutoPlayNext(parsed.autoPlayNext);
        }
        setHistoryBackfilled(true);
      } else {
        setHistoryBackfilled(true);
      }
    } catch {
      // ignore corrupt storage
    }
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, autoPlayNext, history, historyBackfilled }),
    );
  }, [state, autoPlayNext, history, historyBackfilled, loaded]);

  const unwatched = React.useMemo(
    () => state.items.filter((i) => !i.watched && !i.bookmarked && isInQueue(i)),
    [state.items],
  );
  const watched = React.useMemo(
    () => state.items.filter((i) => i.watched && !i.bookmarked && isInQueue(i)),
    [state.items],
  );
  const bookmarked = React.useMemo(() => state.items.filter((i) => i.bookmarked), [state.items]);
  const allTags = React.useMemo(() => {
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
  const currentItem = React.useMemo(
    () => state.items.find((i) => i.id === state.currentId) ?? null,
    [state.items, state.currentId],
  );

  React.useEffect(() => {
    if (!currentItem) return;
    setSidebarTab(currentItem.bookmarked ? "bookmarks" : "recent");
  }, [currentItem?.id, currentItem?.bookmarked]);

  const addItem = React.useCallback(async (url: string) => {
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      toast.error("That doesn't look like a valid YouTube URL.");
      return;
    }

    const alreadyExists = stateRef.current.items.some((i) => i.videoId === videoId);
    if (alreadyExists) {
      toast.error("This video is already in your queue.");
      return;
    }

    setState((prev) => {
      if (prev.items.some((i) => i.videoId === videoId)) {
        return prev;
      }
      const newItem: QueueItem = {
        id: generateId(),
        videoId,
        url,
        title: null,
        channelName: null,
        duration: null,
        thumbnail: buildYouTubeThumbnailUrl(videoId),
        note: "",
        tags: [],
        watched: false,
        bookmarked: false,
        inQueue: true,
        addedAt: Date.now(),
        playbackSeconds: 0,
      };
      return {
        items: [...prev.items, newItem],
        currentId: prev.currentId ?? newItem.id,
      };
    });

    if (!historyRef.current.some((entry) => entry.videoId === videoId)) {
      setHistory((prev) => [
        { videoId, url, title: null, addedAt: Date.now() },
        ...prev,
      ]);
    }

    try {
      const [{ title, channelName }, { duration }] = await Promise.all([
        fetchVideoMetadata({ data: url }),
        fetchVideoDuration({ data: url }),
      ]);
      setState((prev) => ({
        ...prev,
        items: prev.items.map((i) =>
          extractYouTubeId(i.url) === videoId
            ? {
                ...i,
                title: title || i.title,
                channelName: channelName || i.channelName,
                duration: duration ?? i.duration,
              }
            : i,
        ),
      }));
      if (title) {
        setHistory((prev) =>
          prev.map((entry) =>
            entry.videoId === videoId ? { ...entry, title: title || entry.title } : entry,
          ),
        );
      }
    } catch {
      setState((prev) => ({
        ...prev,
        items: prev.items.map((i) =>
          extractYouTubeId(i.url) === videoId
            ? { ...i, title: i.title ?? "Untitled video" }
            : i,
        ),
      }));
      setHistory((prev) =>
        prev.map((entry) =>
          entry.videoId === videoId
            ? { ...entry, title: entry.title ?? "Untitled video" }
            : entry,
        ),
      );
    }
  }, []);

  const removeItem = React.useCallback((id: string) => {
    setState((prev) => {
      const nextItems = prev.items.filter((i) => i.id !== id);
      let nextCurrent = prev.currentId;
      if (prev.currentId === id) {
        const remaining = nextItems.filter((i) => !i.watched);
        nextCurrent = remaining[0]?.id ?? nextItems[0]?.id ?? null;
      }
      return { items: nextItems, currentId: nextCurrent };
    });
  }, []);

  const setCurrent = React.useCallback((id: string) => {
    setState((prev) => ({ ...prev, currentId: id }));
  }, []);

  const toggleWatched = React.useCallback((id: string) => {
    setState((prev) => {
      const item = prev.items.find((i) => i.id === id);
      if (!item) return prev;
      const nextWatched = !item.watched;

      const nextItems = prev.items.map((i) => {
        if (i.id !== id) return i;
        if (!nextWatched) {
          // Unwatching a cleared bookmark (inQueue: false) keeps it in Bookmarks
          // only. Recent never includes bookmarked videos.
          return { ...i, watched: false, inQueue: i.bookmarked ? i.inQueue : true };
        }
        return { ...i, watched: true, playbackSeconds: 0 };
      });

      const active = nextItems.filter(isInQueue);
      const archived = nextItems.filter((i) => !isInQueue(i));
      const activeUnwatched = active.filter((i) => !i.watched);
      const activeWatched = active.filter((i) => i.watched);
      const archivedUnwatched = archived.filter((i) => !i.watched);
      const archivedWatched = archived.filter((i) => i.watched);

      let nextCurrent = prev.currentId;
      if (nextWatched && prev.currentId === id) {
        nextCurrent = activeUnwatched[0]?.id ?? null;
      }

      return {
        items: [
          ...activeUnwatched,
          ...activeWatched,
          ...archivedUnwatched,
          ...archivedWatched,
        ],
        currentId: nextCurrent,
      };
    });
  }, []);

  const toggleBookmark = React.useCallback((id: string) => {
    const item = stateRef.current.items.find((i) => i.id === id);
    if (!item) return;

    setState((prev) => {
      const existing = prev.items.find((i) => i.id === id);
      if (!existing) return prev;
      if (existing.bookmarked && !isInQueue(existing)) {
        const nextItems = prev.items.filter((i) => i.id !== id);
        const nextCurrent =
          prev.currentId === id
            ? nextItems.find((i) => !i.watched && !i.bookmarked && isInQueue(i))?.id ??
              nextItems[0]?.id ??
              null
            : prev.currentId;
        return { items: nextItems, currentId: nextCurrent };
      }
      return {
        ...prev,
        items: prev.items.map((i) => (i.id === id ? { ...i, bookmarked: !i.bookmarked } : i)),
      };
    });
  }, []);

  const reorder = React.useCallback(
    (
      sourceId: string,
      targetId: string,
      section: ReorderSection,
      position?: "before" | "after",
    ) => {
      if (sourceId === targetId) return;
      setState((prev) => {
        const nextItems = reorderMatching(
          prev.items,
          (item) => matchesReorderSection(item, section),
          sourceId,
          targetId,
          position,
        );
        if (!nextItems) return prev;
        return { ...prev, items: nextItems };
      });
    },
    [],
  );

  const updateNote = React.useCallback((id: string, note: string) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.id === id ? { ...i, note } : i)),
    }));
  }, []);

  const updateTags = React.useCallback((id: string, tags: QueueTag[]) => {
    const normalized = normalizeTags(tags);
    setState((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.id === id ? { ...i, tags: normalized } : i)),
    }));
  }, []);

  const updatePlayback = React.useCallback((id: string, seconds: number) => {
    const nextSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    setState((prev) => {
      const item = prev.items.find((i) => i.id === id);
      if (!item || item.playbackSeconds === nextSeconds) return prev;
      return {
        ...prev,
        items: prev.items.map((i) =>
          i.id === id ? { ...i, playbackSeconds: nextSeconds } : i,
        ),
      };
    });
  }, []);

  const clearWatched = React.useCallback(() => {
    setState((prev) => {
      const nextItems = prev.items
        .filter((i) => !i.watched || i.bookmarked)
        .map((i) => (i.watched && i.bookmarked ? { ...i, inQueue: false } : i));
      const nextCurrent = nextItems.find((i) => i.id === prev.currentId)?.id ?? nextItems[0]?.id ?? null;
      return { items: nextItems, currentId: nextCurrent };
    });
  }, []);

  const clearHistory = React.useCallback(() => {
    setHistory([]);
  }, []);

  const readdFromHistory = React.useCallback(async (videoId: string) => {
    const entry = historyRef.current.find((e) => e.videoId === videoId);
    if (!entry) return;

    if (stateRef.current.items.some((i) => i.videoId === videoId)) {
      toast.error("This video is already in your queue.");
      return;
    }

    setState((prev) => {
      if (prev.items.some((i) => i.videoId === videoId)) return prev;
      const newItem: QueueItem = {
        id: generateId(),
        videoId: entry.videoId,
        url: entry.url,
        title: entry.title,
        channelName: null,
        duration: null,
        thumbnail: buildYouTubeThumbnailUrl(entry.videoId),
        note: "",
        tags: [],
        watched: false,
        bookmarked: false,
        inQueue: true,
        addedAt: Date.now(),
        playbackSeconds: 0,
      };
      return {
        items: [...prev.items, newItem],
        currentId: prev.currentId ?? newItem.id,
      };
    });

    try {
      const [{ title, channelName }, { duration }] = await Promise.all([
        fetchVideoMetadata({ data: entry.url }),
        fetchVideoDuration({ data: entry.url }),
      ]);
      setState((prev) => ({
        ...prev,
        items: prev.items.map((i) =>
          i.videoId === videoId
            ? {
                ...i,
                title: title || i.title,
                channelName: channelName || i.channelName,
                duration: duration ?? i.duration,
              }
            : i,
        ),
      }));
      if (title) {
        setHistory((prev) =>
          prev.map((e) => (e.videoId === videoId ? { ...e, title: title || e.title } : e)),
        );
      }
    } catch {
      setState((prev) => ({
        ...prev,
        items: prev.items.map((i) =>
          i.videoId === videoId ? { ...i, title: i.title ?? "Untitled video" } : i,
        ),
      }));
    }
  }, []);

  const finishVideo = React.useCallback(
    (id: string) => {
      setState((prev) => {
        const item = prev.items.find((i) => i.id === id);
        if (!item || item.watched) {
          return prev;
        }
        const nextItems = prev.items.map((i) =>
          i.id === id ? { ...i, watched: true, playbackSeconds: 0 } : i,
        );
        // Move the finished video to the end (watched section).
        const nextUnwatched = nextItems.filter((i) => !i.watched);
        const nextWatchedList = nextItems.filter((i) => i.watched);
        let nextCurrent = prev.currentId;
        if (autoPlayNext && prev.currentId === id) {
          nextCurrent = nextUnwatched[0]?.id ?? nextWatchedList[0]?.id ?? null;
        }
        return { items: [...nextUnwatched, ...nextWatchedList], currentId: nextCurrent };
      });
    },
    [autoPlayNext],
  );

  const playNext = React.useCallback(() => {
    setState((prev) => {
      const index = prev.items.findIndex((i) => i.id === prev.currentId);
      const next = prev.items[index + 1];
      if (!next) return prev;
      return { ...prev, currentId: next.id };
    });
  }, []);

  const playPrevious = React.useCallback(() => {
    setState((prev) => {
      const index = prev.items.findIndex((i) => i.id === prev.currentId);
      const previous = prev.items[index - 1];
      if (!previous) return prev;
      return { ...prev, currentId: previous.id };
    });
  }, []);

  const value = React.useMemo(
    () => ({
      ...state,
      loaded,
      autoPlayNext,
      setAutoPlayNext,
      finishVideo,
      currentItem,
      unwatched,
      watched,
      bookmarked,
      allTags,
      history,
      addItem,
      removeItem,
      setCurrent,
      toggleWatched,
      toggleBookmark,
      sidebarTab,
      setSidebarTab,
      reorder,
      updateNote,
      updateTags,
      updatePlayback,
      clearWatched,
      clearHistory,
      readdFromHistory,
      playNext,
      playPrevious,
    }),
    [
      state,
      loaded,
      autoPlayNext,
      setAutoPlayNext,
      finishVideo,
      currentItem,
      unwatched,
      watched,
      bookmarked,
      allTags,
      history,
      addItem,
      removeItem,
      setCurrent,
      toggleWatched,
      toggleBookmark,
      sidebarTab,
      setSidebarTab,
      reorder,
      updateNote,
      updateTags,
      updatePlayback,
      clearWatched,
      clearHistory,
      readdFromHistory,
      playNext,
      playPrevious,
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
