import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VideoTagEditor } from "@/components/video-tag-editor";
import { useQueue } from "@/components/queue-provider";
import type { QueueItem } from "@/components/queue-provider";

/**
 * Tagging a bookmarked video from its card, so categorising never depends on
 * playing the video first.
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Tags</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {item.title ?? "Untitled video"}
          </DialogDescription>
        </DialogHeader>

        <VideoTagEditor
          tags={item.tags}
          allTags={allTags}
          onChange={(tags) => updateTags(item.id, tags)}
          onCreateTag={addTagToLibrary}
          onDeleteTag={deleteTag}
          countTagUsage={countTagUsage}
          layout="inline"
        />
      </DialogContent>
    </Dialog>
  );
}
