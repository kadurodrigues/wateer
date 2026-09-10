import * as React from "react";
import { Edit2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { QueueItem } from "@/components/queue-provider";
import { normalizeTags, type QueueTag } from "@/lib/tags";

interface VideoDetailsProps {
  item: QueueItem;
  onUpdateNote: (note: string) => void;
  onUpdateTags: (tags: QueueTag[]) => void;
}

function tagsToDraft(tags: QueueTag[]) {
  return tags.map((tag) => tag.name).join(", ");
}

export function VideoDetails({ item, onUpdateNote, onUpdateTags }: VideoDetailsProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftNote, setDraftNote] = React.useState(item.note);
  const [draftTags, setDraftTags] = React.useState(tagsToDraft(item.tags));

  React.useEffect(() => {
    if (isEditing) {
      setDraftNote(item.note);
      setDraftTags(tagsToDraft(item.tags));
    }
  }, [isEditing, item.note, item.tags]);

  function saveEdits() {
    onUpdateNote(draftNote.trim());
    onUpdateTags(normalizeTags(draftTags.split(",")));
    setIsEditing(false);
  }

  function cancelEdits() {
    setDraftNote(item.note);
    setDraftTags(tagsToDraft(item.tags));
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-4">
        <Textarea
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          placeholder="Add a note..."
          className="min-h-[80px] resize-none text-sm"
        />
        <Input
          value={draftTags}
          onChange={(e) => setDraftTags(e.target.value)}
          placeholder="Tags separated by commas"
          className="text-sm"
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={saveEdits} className="h-8 text-xs">
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={cancelEdits}
            className="h-8 text-xs"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {item.note ? (
            <p className="text-sm leading-relaxed text-foreground">{item.note}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">No note yet.</p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs"
          onClick={() => setIsEditing(true)}
        >
          <Edit2 className="h-3.5 w-3.5" />
          Edit
        </Button>
      </div>

      {item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <Badge key={tag.name} variant="secondary" className="text-xs">
              {tag.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
