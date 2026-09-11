import * as React from "react";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCircle2,
  EllipsisVertical,
  GripVertical,
  RotateCcw,
  Tag,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getTagColor } from "@/lib/tags";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/youtube";
import { VideoTagDialog } from "@/components/video-tag-dialog";
import type { QueueItem } from "@/components/queue-provider";

interface QueueItemProps {
  item: QueueItem;
  isActive: boolean;
  isDragging?: boolean;
  dragActive?: boolean;
  shiftY?: number;
  showDropSlot?: boolean;
  onPlay: () => void;
  onRemove: () => void;
  onToggleWatched: () => void;
  onToggleBookmark?: () => void;
  overflowMenu?: boolean;
  onDragStart: (id: string, startY: number) => void;
  onDragEnter?: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragLeave?: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd?: () => void;
}

export function QueueItemCard({
  item,
  isActive,
  isDragging,
  dragActive,
  shiftY = 0,
  showDropSlot,
  onPlay,
  onRemove,
  onToggleWatched,
  onToggleBookmark,
  overflowMenu = false,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onDragEnd,
}: QueueItemProps) {
  const [tagDialogOpen, setTagDialogOpen] = React.useState(false);

  return (
    <div
      data-queue-item
      data-queue-id={item.id}
      role="listitem"
      aria-label={item.title ?? "Untitled video"}
      draggable={!item.watched}
      onDragStart={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-drag]")) {
          e.preventDefault();
          return;
        }
        onDragStart(item.id, e.clientY);
      }}
      onDragEnter={(e) => onDragEnter?.(e, item.id)}
      onDragLeave={(e) => onDragLeave?.(e, item.id)}
      onDragOver={(e) => onDragOver(e, item.id)}
      onDrop={(e) => onDrop(e, item.id)}
      onDragEnd={() => onDragEnd?.()}
      className="relative min-w-0 w-full"
    >
      {showDropSlot && (
        <div
          className="pointer-events-none absolute inset-0 rounded-[1.75rem] border-2 border-dashed border-brand bg-brand-soft"
          aria-hidden="true"
        />
      )}
      <div
        style={{ transform: shiftY ? `translateY(${shiftY}px)` : undefined }}
        className={cn(
          "group relative min-w-0 overflow-hidden rounded-[1.75rem] border-2 bg-card p-4",
          dragActive && "z-10",
          dragActive
            ? "motion-safe:transition-[transform,border-color] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.25,1,0.5,1)]"
            : "transition-colors",
          isActive && !item.watched
            ? "border-brand shadow-sm"
            : item.watched
              ? "border-border"
              : "border-border hover:border-brand",
          isDragging && "opacity-40",
        )}
      >
        <div className="flex min-w-0 gap-4">
          {item.watched ? (
            <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-muted text-left">
              <img
                src={item.thumbnail}
                alt={item.title ?? "Video thumbnail"}
                className="h-full w-full object-cover grayscale outline outline-1 outline-black/10 dark:outline-white/10"
                loading="lazy"
              />

              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Check className="h-6 w-6 text-white drop-shadow-md" strokeWidth={3} />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onPlay}
              className="relative aspect-video w-32 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img
                src={item.thumbnail}
                alt={item.title ?? "Video thumbnail"}
                className="h-full w-full object-cover outline outline-1 outline-black/10 dark:outline-white/10 transition-transform duration-300 ease-out motion-safe:group-hover:scale-110"
                loading="lazy"
              />

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/50 shadow-lg backdrop-blur-md transition-transform duration-200 group-hover:scale-110 dark:bg-black/50">
                  <svg
                    viewBox="0 0 24 24"
                    className="ml-0.5 h-[1.1rem] w-[1.1rem] fill-white text-white"
                    aria-hidden="true"
                  >
                    <path d="M8.5 5.2c-.3-.2-.7-.1-.9.2-.1.2-.2.4-.2.6v12c0 .5.4.9.9.9.2 0 .4-.1.6-.2l10-6c.3-.2.5-.6.3-1-.1-.2-.2-.3-.3-.4l-10-6z" />
                  </svg>
                </div>
              </div>

              {isActive && !item.watched && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <EqualizerIcon />
                </div>
              )}
            </button>
          )}

          <div className="flex min-w-0 flex-1 flex-col justify-between overflow-hidden">
            <div className="min-w-0">
              <h3 className="min-w-0 text-left text-sm font-semibold leading-snug text-foreground">
                <span className={cn("line-clamp-2 break-words", item.watched && "line-through")}>
                  {item.title ?? "Untitled video"}
                </span>
              </h3>

              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{item.channelName ?? "Unknown channel"}</span>
                {item.duration != null && (
                  <span className="shrink-0 tabular-nums">{formatDuration(item.duration)}</span>
                )}
              </div>
            </div>

            <div className="mt-2 flex min-w-0 items-center justify-between gap-1.5">
              {item.bookmarked && item.tags.length > 0 ? (
                <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                  {item.tags.slice(0, 2).map((tag) => (
                    <Badge
                      key={tag.name}
                      variant="outline"
                      className={cn(
                        "max-w-[5.5rem] truncate px-1.5 py-0 text-[10px] font-medium",
                        getTagColor(tag.color).badge,
                      )}
                      title={tag.name}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                  {item.tags.length > 2 && (
                    <Badge
                      variant="outline"
                      className="shrink-0 px-1.5 py-0 text-[10px] font-medium"
                      title={item.tags
                        .slice(2)
                        .map((tag) => tag.name)
                        .join(", ")}
                    >
                      +{item.tags.length - 2}
                    </Badge>
                  )}
                </div>
              ) : (
                <span className="min-w-0" />
              )}
              <div className="flex shrink-0 items-center gap-0.5">
                <TooltipProvider delayDuration={300}>
                  {overflowMenu ? (
                    <>
                      {!item.watched && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex h-7 w-7 cursor-move items-center justify-center text-muted-foreground">
                              <GripVertical className="h-3.5 w-3.5" />
                              <span className="sr-only">Drag to reorder</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Drag to reorder</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <BookmarkCardMenu
                        item={item}
                        onToggleWatched={onToggleWatched}
                        onToggleBookmark={onToggleBookmark}
                        onRemove={onRemove}
                        onEditTags={() => setTagDialogOpen(true)}
                      />
                    </>
                  ) : (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={cn("h-7 w-7 text-muted-foreground hover:text-success")}
                            onClick={onToggleWatched}
                          >
                            {item.watched ? (
                              <RotateCcw className="h-3.5 w-3.5" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            <span className="sr-only">
                              Mark as {item.watched ? "unwatched" : "watched"}
                            </span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Mark as {item.watched ? "unwatched" : "watched"}</p>
                        </TooltipContent>
                      </Tooltip>

                      {onToggleBookmark && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-brand"
                              onClick={onToggleBookmark}
                            >
                              {item.bookmarked ? (
                                <BookmarkCheck className="h-3.5 w-3.5 fill-brand text-brand" />
                              ) : (
                                <Bookmark className="h-3.5 w-3.5" />
                              )}
                              <span className="sr-only">
                                {item.bookmarked ? "Remove bookmark" : "Bookmark"}
                              </span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{item.bookmarked ? "Remove bookmark" : "Bookmark"}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {!item.watched && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex h-7 w-7 cursor-move items-center justify-center text-muted-foreground">
                              <GripVertical className="h-3.5 w-3.5" />
                              <span className="sr-only">Drag to reorder</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Drag to reorder</p>
                          </TooltipContent>
                        </Tooltip>
                      )}

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={onRemove}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="sr-only">Remove</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Remove</p>
                        </TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>
      </div>

      {overflowMenu && (
        <VideoTagDialog item={item} open={tagDialogOpen} onOpenChange={setTagDialogOpen} />
      )}
    </div>
  );
}

const menuItemClassName =
  "cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground focus:bg-muted";

function BookmarkCardMenu({
  item,
  onToggleWatched,
  onToggleBookmark,
  onRemove,
  onEditTags,
}: {
  item: QueueItem;
  onToggleWatched: () => void;
  onToggleBookmark?: (() => void) | undefined;
  onRemove: () => void;
  onEditTags: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-no-drag
          className="h-7 w-7 rounded-xl text-muted-foreground shadow-none drop-shadow-none hover:bg-muted hover:text-foreground hover:shadow-none"
          aria-label="More options"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <EllipsisVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 rounded-2xl border-border p-2 shadow-xl"
      >
        <DropdownMenuItem className={cn(menuItemClassName, "group")} onSelect={onToggleWatched}>
          {item.watched ? (
            <RotateCcw className="h-4 w-4 text-muted-foreground group-focus:text-success group-hover:text-success" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-muted-foreground group-focus:text-success group-hover:text-success" />
          )}
          Mark as {item.watched ? "unwatched" : "watched"}
        </DropdownMenuItem>
        <DropdownMenuItem
          className={cn(menuItemClassName, "group")}
          onSelect={() => {
            // Let the menu unmount before the dialog, so they don't stack.
            window.setTimeout(onEditTags, 0);
          }}
        >
          <Tag className="h-4 w-4 text-muted-foreground group-focus:text-brand group-hover:text-brand" />
          {item.tags.length > 0 ? "Edit tags" : "Add tags"}
        </DropdownMenuItem>
        {onToggleBookmark && (
          <DropdownMenuItem className={cn(menuItemClassName, "group")} onSelect={onToggleBookmark}>
            <Bookmark className="h-4 w-4 text-muted-foreground group-focus:text-brand group-hover:text-brand" />
            Remove bookmark
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className={cn(menuItemClassName, "text-destructive focus:text-destructive")}
          onSelect={onRemove}
        >
          <Trash2 className="h-4 w-4" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EqualizerIcon() {
  return (
    <div className="flex h-5 items-end gap-[3px]" role="img" aria-label="Now playing">
      <span className="animate-equalizer w-[3px] rounded-full bg-white [animation-delay:-0.4s]" />
      <span className="animate-equalizer w-[3px] rounded-full bg-white [animation-delay:-0.2s]" />
      <span className="animate-equalizer w-[3px] rounded-full bg-white" />
    </div>
  );
}
