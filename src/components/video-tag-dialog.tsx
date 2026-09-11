import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VideoTagEditor } from "@/components/video-tag-editor";
import { useQueue } from "@/components/queue-provider";
import type { QueueItem } from "@/components/queue-provider";
import type { QueueTag } from "@/lib/tags";

/**
 * Tagging a bookmarked video from its card, so categorising never depends on
 * playing the video first. Drafts stay local until Apply.
 */
export function VideoTagDialog({
  item,
  open,
  onOpenChange,
}: {
  item: QueueItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { allTags, addTagToLibrary, deleteTag, countTagUsage, updateTags } = useQueue();
  const [draftTags, setDraftTags] = React.useState<QueueTag[]>(item.tags);

  React.useEffect(() => {
    if (open) setDraftTags(item.tags);
  }, [open, item.id, item.tags]);

  function closeWithoutApplying() {
    setDraftTags(item.tags);
    onOpenChange(false);
  }

  function applyAndClose() {
    updateTags(item.id, draftTags);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else closeWithoutApplying();
      }}
    >
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Tags</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {item.title ?? "Untitled video"}
          </DialogDescription>
        </DialogHeader>

        <VideoTagEditor
          tags={draftTags}
          allTags={allTags}
          onChange={setDraftTags}
          onCreateTag={addTagToLibrary}
          onDeleteTag={deleteTag}
          countTagUsage={countTagUsage}
          layout="inline"
        />

        <DialogFooter className="gap-3 sm:justify-end">
          <Button type="button" variant="outline" onClick={closeWithoutApplying}>
            Cancel
          </Button>
          <Button type="button" variant="brand" onClick={applyAndClose}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
