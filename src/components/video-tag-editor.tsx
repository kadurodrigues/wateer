import * as React from "react";
import { ChevronsUpDown, Plus, Tag, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  DEFAULT_TAG_COLOR,
  getTagColor,
  TAG_COLORS,
  type QueueTag,
  type TagColorId,
} from "@/lib/tags";
import { cn } from "@/lib/utils";

interface VideoTagEditorProps {
  tags: QueueTag[];
  allTags: QueueTag[];
  onChange: (tags: QueueTag[]) => void;
  onCreateTag: (tag: QueueTag) => void;
  onDeleteTag: (name: string) => void;
  countTagUsage: (name: string) => number;
  /** Popover under the player; inline form inside the card dialog. */
  layout?: "popover" | "inline";
}

export function VideoTagEditor({
  tags,
  allTags,
  onChange,
  onCreateTag,
  onDeleteTag,
  countTagUsage,
  layout = "popover",
}: VideoTagEditorProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [color, setColor] = React.useState<TagColorId>(DEFAULT_TAG_COLOR);
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const fieldId = React.useId();
  const nameFieldId = `${fieldId}-name`;
  const colorFieldId = `${fieldId}-color`;

  const normalizedQuery = query.trim();
  const queryKey = normalizedQuery.toLowerCase();
  const selectedKeys = React.useMemo(
    () => new Set(tags.map((tag) => tag.name.toLowerCase())),
    [tags],
  );

  const matchingTags = React.useMemo(
    () =>
      allTags.filter((tag) => {
        if (!queryKey) return true;
        return tag.name.toLowerCase().includes(queryKey);
      }),
    [allTags, queryKey],
  );

  const unappliedMatch = React.useMemo(
    () => matchingTags.find((tag) => !selectedKeys.has(tag.name.toLowerCase())),
    [matchingTags, selectedKeys],
  );

  const canCreate =
    normalizedQuery.length > 0 &&
    !selectedKeys.has(queryKey) &&
    !allTags.some((tag) => tag.name.toLowerCase() === queryKey);

  const selectedColor = getTagColor(color);

  function closePopover() {
    setOpen(false);
    setQuery("");
    setColor(DEFAULT_TAG_COLOR);
  }

  /** Applying a tag: attach an existing tag to this video. */
  function applyTag(tag: QueueTag) {
    const name = tag.name.trim();
    if (!name) return;
    if (tags.some((existing) => existing.name.toLowerCase() === name.toLowerCase())) {
      closePopover();
      return;
    }
    onChange([...tags, { name, color: tag.color }]);
    closePopover();
  }

  /** Creating a tag: add it to the library, then apply it here. */
  function createTag() {
    if (!canCreate) return;
    const tag = { name: normalizedQuery, color };
    onCreateTag(tag);
    applyTag(tag);
  }

  function unapplyTag(name: string) {
    onChange(tags.filter((existing) => existing.name !== name));
  }

  function confirmDeleteTag(name: string) {
    const used = countTagUsage(name);
    const scope =
      used === 0
        ? `Delete the tag "${name}"? It is not used on any video.`
        : `Delete "${name}" from ${used} ${used === 1 ? "video" : "videos"}?`;
    if (!window.confirm(`${scope} This removes it everywhere and cannot be undone.`)) {
      return;
    }
    onDeleteTag(name);
    nameInputRef.current?.focus();
  }

  function handleNameKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (canCreate) {
      createTag();
      return;
    }
    const exact = matchingTags.find((tag) => tag.name.toLowerCase() === queryKey);
    if (exact) applyTag(exact);
    else if (unappliedMatch) applyTag(unappliedMatch);
  }

  const picker = (
    <>
      <div className="grid grid-cols-[1.35fr_1fr] gap-2 p-3">
        <div className="min-w-0 space-y-1.5">
          <label htmlFor={nameFieldId} className="text-[11px] font-medium text-muted-foreground">
            Tag name
          </label>
          <div className="relative">
            <Input
              id={nameFieldId}
              ref={nameInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleNameKeyDown}
              placeholder="Search or create…"
              className="h-9 pe-8 shadow-none"
              autoComplete="off"
            />
            <ChevronsUpDown className="pointer-events-none absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
          </div>
        </div>

        <div className="min-w-0 space-y-1.5">
          <label htmlFor={colorFieldId} className="text-[11px] font-medium text-muted-foreground">
            Color
          </label>
          <Select value={color} onValueChange={(value) => setColor(value as TagColorId)}>
            <SelectTrigger id={colorFieldId} className="h-9 px-2.5 shadow-none">
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn("h-3 w-3 shrink-0 rounded-full", selectedColor.dot)} />
                <span className="truncate">{selectedColor.label}</span>
              </span>
            </SelectTrigger>
            <SelectContent className="z-[60]">
              {TAG_COLORS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <span className="flex items-center gap-2">
                    <span className={cn("h-3 w-3 rounded-full", option.dot)} />
                    {option.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border-t border-border">
        {matchingTags.length > 0 && (
          <ul className="max-h-44 overflow-y-auto p-1">
            {matchingTags.map((tag) => {
              const tagColor = getTagColor(tag.color);
              const applied = selectedKeys.has(tag.name.toLowerCase());
              return (
                <li key={tag.name} className="group/tag flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => applyTag(tag)}
                    disabled={applied}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-60"
                  >
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", tagColor.dot)} />
                    <span className="truncate">{tag.name}</span>
                    {applied && <span className="ms-auto text-xs text-muted-foreground">On</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmDeleteTag(tag.name)}
                    className="shrink-0 rounded-sm p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover/tag:opacity-100"
                    aria-label={`Delete tag ${tag.name} everywhere`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {canCreate && (
          <div className={cn(matchingTags.length > 0 && "border-t border-border")}>
            <button
              type="button"
              onClick={createTag}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <Plus className="h-4 w-4" />
              Create “{normalizedQuery}”
            </button>
          </div>
        )}

        {matchingTags.length === 0 && !canCreate && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {normalizedQuery ? "No matching tags." : "No tags yet."}
          </p>
        )}
      </div>
    </>
  );

  const badges =
    tags.length > 0 ? (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {tags.map((tag) => {
          const tagColor = getTagColor(tag.color);
          return (
            <Badge
              key={tag.name}
              variant="outline"
              className={cn("gap-1 pe-1 text-xs font-medium", tagColor.badge)}
            >
              {tag.name}
              <button
                type="button"
                onClick={() => unapplyTag(tag.name)}
                className="rounded-sm p-0.5 opacity-70 transition-colors hover:bg-black/5 hover:opacity-100"
                aria-label={`Remove tag ${tag.name} from this video`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
      </div>
    ) : null;

  if (layout === "inline") {
    return (
      <div className="space-y-4">
        {badges}
        <div className="overflow-hidden rounded-xl border border-border">{picker}</div>
      </div>
    );
  }

  return (
    // Tags are content, "Add tag" is a control: 8px inside the badge group,
    // 16px before the button so the two stop reading as one row of chips.
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      {badges}

      <Popover
        modal={false}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
            setColor(DEFAULT_TAG_COLOR);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className="gap-1.5"
          >
            <Tag />
            Add tag
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(22rem,calc(100vw-3rem))] p-0"
          align="start"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameInputRef.current?.focus();
          }}
          onInteractOutside={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('[role="listbox"]')) {
              event.preventDefault();
            }
          }}
        >
          {picker}
        </PopoverContent>
      </Popover>
    </div>
  );
}
