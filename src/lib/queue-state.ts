import { reorderMatching } from "./queue-order";
import {
  addTagToLibrary,
  normalizeTags,
  removeTagByName,
  removeTagFromLibrary,
  type QueueTag,
} from "./tags";

export type QueueItem = {
  id: string;
  videoId: string;
  url: string;
  title: string | null;
  channelName: string | null;
  duration: number | null;
  thumbnail: string;
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

export type QueueState = {
  items: QueueItem[];
  currentId: string | null;
  tagLibrary: QueueTag[];
  history: HistoryEntry[];
  autoPlayNext: boolean;
};

export type ReorderSection =
  "unwatched" | "watched" | "bookmarked-unwatched" | "bookmarked-watched";

/** An item as it stood before a destructive action, so the action can be undone. */
export type ItemSnapshot = { item: QueueItem; index: number };

export type VideoDetails = {
  title: string;
  channelName: string;
  duration: number | null;
};

export type QueueAction =
  /** Replace everything, e.g. after loading from storage or importing a backup. */
  | { type: "replace"; state: QueueState }
  /** Adopt state saved by another tab, but keep playing whatever this tab is playing. */
  | { type: "sync"; state: QueueState }
  | { type: "add"; item: QueueItem }
  | { type: "details-loaded"; videoId: string; details: VideoDetails }
  | { type: "details-failed"; videoId: string }
  | { type: "remove"; id: string }
  | { type: "set-current"; id: string }
  | { type: "toggle-watched"; id: string }
  | { type: "toggle-bookmark"; id: string }
  | { type: "finish"; id: string }
  | {
      type: "reorder";
      sourceId: string;
      targetId: string;
      section: ReorderSection;
      position?: "before" | "after" | undefined;
    }
  | { type: "update-tags"; id: string; tags: QueueTag[] }
  | { type: "update-playback"; id: string; seconds: number }
  | { type: "clear-watched" }
  | { type: "clear-history" }
  | {
      type: "restore-items";
      snapshots: ItemSnapshot[];
      /** The current video before the undone action. */
      currentId: string | null;
      /** The current video the undone action left behind. */
      currentIdAfter: string | null;
    }
  | { type: "restore-history"; entries: HistoryEntry[] }
  | { type: "create-tag"; tag: QueueTag }
  | { type: "delete-tag"; name: string }
  | { type: "set-auto-play"; value: boolean };

export const initialQueueState: QueueState = {
  items: [],
  currentId: null,
  tagLibrary: [],
  history: [],
  autoPlayNext: false,
};

export function isInQueue(item: QueueItem) {
  return item.inQueue !== false;
}

export function matchesSection(item: QueueItem, section: ReorderSection) {
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

/**
 * What to play once `leaving` stops being playable: the top of the list it was in.
 * A queued video hands over to the queue, a bookmarked one to the bookmarks, so
 * finishing a queued video never jumps into the collection.
 */
export function nextAfter(items: QueueItem[], leaving: QueueItem): string | null {
  const section: ReorderSection = leaving.bookmarked ? "bookmarked-unwatched" : "unwatched";
  return items.find((i) => i.id !== leaving.id && matchesSection(i, section))?.id ?? null;
}

/** Stable order: queued unwatched, queued watched, then bookmarks cleared out of the queue. */
function partitionByWatched(items: QueueItem[]): QueueItem[] {
  const active = items.filter(isInQueue);
  const archived = items.filter((i) => !isInQueue(i));
  return [
    ...active.filter((i) => !i.watched),
    ...active.filter((i) => i.watched),
    ...archived.filter((i) => !i.watched),
    ...archived.filter((i) => i.watched),
  ];
}

function withoutItem(state: QueueState, id: string): QueueState {
  const leaving = state.items.find((i) => i.id === id);
  if (!leaving) return state;
  const items = state.items.filter((i) => i.id !== id);
  const currentId = state.currentId === id ? nextAfter(items, leaving) : state.currentId;
  return { ...state, items, currentId };
}

function mapItem(state: QueueState, id: string, update: (item: QueueItem) => QueueItem) {
  return { ...state, items: state.items.map((i) => (i.id === id ? update(i) : i)) };
}

export function mergeHistory(existing: HistoryEntry[], incoming: HistoryEntry[]): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>();
  for (const entry of [...existing, ...incoming]) {
    const prev = byId.get(entry.videoId);
    if (!prev) byId.set(entry.videoId, entry);
    else if (!prev.title && entry.title) byId.set(entry.videoId, { ...prev, title: entry.title });
  }
  return Array.from(byId.values()).sort((a, b) => b.addedAt - a.addedAt);
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case "replace":
      return action.state;

    case "sync": {
      const keepCurrent =
        state.currentId != null && action.state.items.some((i) => i.id === state.currentId);
      return keepCurrent ? { ...action.state, currentId: state.currentId } : action.state;
    }

    case "add": {
      const { item } = action;
      if (state.items.some((i) => i.videoId === item.videoId)) return state;
      const history = state.history.some((e) => e.videoId === item.videoId)
        ? state.history
        : [
            { videoId: item.videoId, url: item.url, title: item.title, addedAt: item.addedAt },
            ...state.history,
          ];
      return { ...state, items: [...state.items, item], currentId: item.id, history };
    }

    case "details-loaded": {
      const { videoId, details } = action;
      return {
        ...state,
        items: state.items.map((i) =>
          i.videoId === videoId
            ? {
                ...i,
                title: details.title || i.title,
                channelName: details.channelName || i.channelName,
                duration: details.duration ?? i.duration,
              }
            : i,
        ),
        history: details.title
          ? state.history.map((e) => (e.videoId === videoId ? { ...e, title: details.title } : e))
          : state.history,
      };
    }

    case "details-failed":
      return {
        ...state,
        items: state.items.map((i) =>
          i.videoId === action.videoId ? { ...i, title: i.title ?? "Untitled video" } : i,
        ),
        history: state.history.map((e) =>
          e.videoId === action.videoId ? { ...e, title: e.title ?? "Untitled video" } : e,
        ),
      };

    case "remove":
      return withoutItem(state, action.id);

    case "set-current":
      return state.items.some((i) => i.id === action.id)
        ? { ...state, currentId: action.id }
        : state;

    case "toggle-watched": {
      const item = state.items.find((i) => i.id === action.id);
      if (!item) return state;
      const toggled: QueueItem = item.watched
        ? // Unwatching a cleared bookmark keeps it in Bookmarks only.
          { ...item, watched: false, inQueue: item.bookmarked ? item.inQueue : true }
        : { ...item, watched: true, playbackSeconds: 0 };
      const items = partitionByWatched(state.items.map((i) => (i.id === item.id ? toggled : i)));
      const currentId =
        toggled.watched && state.currentId === item.id ? nextAfter(items, item) : state.currentId;
      return { ...state, items, currentId };
    }

    case "toggle-bookmark": {
      const item = state.items.find((i) => i.id === action.id);
      if (!item) return state;
      // A bookmark already cleared out of the queue has nowhere to go back to.
      if (item.bookmarked && !isInQueue(item)) return withoutItem(state, item.id);
      return mapItem(state, item.id, (i) => ({ ...i, bookmarked: !i.bookmarked }));
    }

    case "finish": {
      const item = state.items.find((i) => i.id === action.id);
      if (!item || item.watched) return state;
      const items = partitionByWatched(
        state.items.map((i) =>
          i.id === item.id ? { ...i, watched: true, playbackSeconds: 0 } : i,
        ),
      );
      // With nothing left to play, stay on the finished video rather than replay a watched one.
      const currentId =
        state.autoPlayNext && state.currentId === item.id
          ? (nextAfter(items, item) ?? item.id)
          : state.currentId;
      return { ...state, items, currentId };
    }

    case "reorder": {
      if (action.sourceId === action.targetId) return state;
      const items = reorderMatching(
        state.items,
        (item) => matchesSection(item, action.section),
        action.sourceId,
        action.targetId,
        action.position,
      );
      return items ? { ...state, items } : state;
    }

    case "update-tags": {
      const tags = normalizeTags(action.tags);
      return mapItem(state, action.id, (i) => ({ ...i, tags }));
    }

    case "update-playback": {
      const seconds = Number.isFinite(action.seconds) ? Math.max(0, Math.floor(action.seconds)) : 0;
      const item = state.items.find((i) => i.id === action.id);
      // A watched video has no resume point; the player reports its end time on unmount.
      if (!item || item.watched || item.playbackSeconds === seconds) return state;
      return mapItem(state, item.id, (i) => ({ ...i, playbackSeconds: seconds }));
    }

    case "clear-watched": {
      const items = state.items
        .filter((i) => !i.watched || i.bookmarked)
        .map((i) => (i.watched && i.bookmarked ? { ...i, inQueue: false } : i));
      const current = state.items.find((i) => i.id === state.currentId);
      const currentId =
        !current || items.some((i) => i.id === current.id)
          ? state.currentId
          : nextAfter(items, current);
      return { ...state, items, currentId };
    }

    case "clear-history":
      return { ...state, history: [] };

    case "restore-items": {
      const items = [...state.items];
      const ordered = [...action.snapshots].sort((a, b) => a.index - b.index);
      for (const { item, index } of ordered) {
        const existing = items.findIndex((i) => i.id === item.id);
        if (existing !== -1) {
          items[existing] = item;
          continue;
        }
        // Re-added from scratch since; don't bring back a duplicate.
        if (items.some((i) => i.videoId === item.videoId)) continue;
        items.splice(Math.min(index, items.length), 0, item);
      }
      // Only take back the current video if nothing else has been picked since.
      const currentId =
        state.currentId === action.currentIdAfter && items.some((i) => i.id === action.currentId)
          ? action.currentId
          : state.currentId;
      return { ...state, items, currentId };
    }

    case "restore-history":
      return { ...state, history: mergeHistory(state.history, action.entries) };

    case "create-tag":
      return { ...state, tagLibrary: addTagToLibrary(state.tagLibrary, action.tag) };

    case "delete-tag": {
      const key = action.name.trim().toLowerCase();
      return {
        ...state,
        tagLibrary: removeTagFromLibrary(state.tagLibrary, action.name),
        items: state.items.map((i) =>
          i.tags.some((tag) => tag.name.toLowerCase() === key)
            ? { ...i, tags: removeTagByName(i.tags, action.name) }
            : i,
        ),
      };
    }

    case "set-auto-play":
      return { ...state, autoPlayNext: action.value };
  }
}
