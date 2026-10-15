import * as React from "react";
import { ListVideo } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { QueuePanel } from "@/components/queue-panel";

export function QueueMobileDrawer() {
  const [open, setOpen] = React.useState(false);

  // The drawer covers the player on phones: get out of the way once a video is picked,
  // and bring the player back into view if the page was scrolled down to comments.
  function handlePlay() {
    setOpen(false);
    document.getElementById("main-content")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full shadow-xl lg:hidden"
          aria-label="Open queue"
        >
          <ListVideo className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      {/* Narrower than the screen, so the page beside it can be tapped to close it. */}
      <SheetContent side="right" hideClose className="w-[88%] max-w-sm p-0">
        <div className="sr-only">
          <SheetHeader>
            <SheetTitle>Queue</SheetTitle>
          </SheetHeader>
        </div>
        <div className="h-full">
          <QueuePanel onPlay={handlePlay} onClose={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
