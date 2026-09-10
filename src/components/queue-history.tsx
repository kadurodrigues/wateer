import * as React from "react";
import { History, ListPlus, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQueue } from "@/components/queue-provider";
import { cn } from "@/lib/utils";

export function QueueHistory() {
  const { history, items, clearHistory, readdFromHistory } = useQueue();
  const [open, setOpen] = React.useState(false);
  const [addingId, setAddingId] = React.useState<string | null>(null);

  const queueVideoIds = React.useMemo(
    () => new Set(items.map((item) => item.videoId)),
    [items],
  );

  function handleClear() {
    clearHistory();
    setOpen(false);
  }

  async function handleReadd(videoId: string) {
    setAddingId(videoId);
    try {
      await readdFromHistory(videoId);
    } finally {
      setAddingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-xl text-muted-foreground shadow-none drop-shadow-none hover:bg-muted hover:text-foreground hover:shadow-none"
          aria-label="History"
        >
          <History className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(42rem,90vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            Videos you have added to the app.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 [&>div]:max-h-[min(26rem,58vh)]">
          <div className="px-4 py-2">
            {history.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No videos in history yet.
              </p>
            ) : (
              <TooltipProvider delayDuration={300}>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-2">Title</TableHead>
                      <TableHead className="w-[7.5rem] whitespace-nowrap">
                        Added At
                      </TableHead>
                      <TableHead className="w-14 pr-2 text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((entry) => {
                      const inQueue = queueVideoIds.has(entry.videoId);
                      const clearedOut = !inQueue;
                      const isAdding = addingId === entry.videoId;
                      return (
                        <TableRow
                          key={entry.videoId}
                          className={cn(
                            clearedOut && "bg-muted/30 text-muted-foreground hover:bg-muted/40",
                          )}
                        >
                          <TableCell className="max-w-0 pl-2 align-top">
                            <p
                              className={cn(
                                "truncate text-sm font-medium",
                                clearedOut
                                  ? "text-muted-foreground line-through"
                                  : "text-foreground",
                              )}
                            >
                              {entry.title ?? "Untitled video"}
                            </p>
                            <a
                              href={entry.url}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                "mt-0.5 block truncate text-xs underline-offset-2 hover:underline",
                                clearedOut
                                  ? "text-muted-foreground/80 hover:text-brand"
                                  : "text-muted-foreground hover:text-brand",
                              )}
                            >
                              {entry.url}
                            </a>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "whitespace-nowrap align-top text-xs",
                              clearedOut ? "text-muted-foreground/80" : "text-muted-foreground",
                            )}
                          >
                            {formatRelativeDate(entry.addedAt)}
                          </TableCell>
                          <TableCell className="pr-2 text-center align-middle">
                            {clearedOut ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-background hover:text-brand"
                                    aria-label={`Add ${entry.title ?? "video"} to queue`}
                                    disabled={isAdding}
                                    onClick={() => void handleReadd(entry.videoId)}
                                  >
                                    <span className="relative inline-flex size-4">
                                      <span
                                        className={cn(
                                          "absolute inset-0 flex items-center justify-center",
                                          "transition-[opacity,filter,scale] duration-300",
                                          "ease-[cubic-bezier(0.2,0,0,1)]",
                                          isAdding
                                            ? "scale-100 opacity-100 blur-0"
                                            : "scale-[0.25] opacity-0 blur-[4px]",
                                        )}
                                        aria-hidden={!isAdding}
                                      >
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      </span>
                                      <span
                                        className={cn(
                                          "flex items-center justify-center",
                                          "transition-[opacity,filter,scale] duration-300",
                                          "ease-[cubic-bezier(0.2,0,0,1)]",
                                          isAdding
                                            ? "scale-[0.25] opacity-0 blur-[4px]"
                                            : "scale-100 opacity-100 blur-0",
                                        )}
                                        aria-hidden={isAdding}
                                      >
                                        <ListPlus className="h-4 w-4" />
                                      </span>
                                    </span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Add to queue</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TooltipProvider>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border px-6 py-4 sm:justify-stretch">
          <Button
            type="button"
            variant="brand"
            className="w-full text-xs font-bold"
            onClick={handleClear}
            disabled={history.length === 0}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" strokeWidth={2} />
            Clear History
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
