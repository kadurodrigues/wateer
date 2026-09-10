import * as React from "react";
import { ChevronsUpDown, Plus, Tag, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
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
}

export function VideoTagEditor({ tags, allTags, onChange }: VideoTagEditorProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [color, setColor] = React.useState<TagColorId>(DEFAULT_TAG_COLOR);
  const nameInputRef = React.useRef<HTMLInputElement>(null);

  const normalizedQuery = query.trim();
  const queryKey = normalizedQuery.toLowerCase();
  const selectedKeys = React.useMemo(
    () => new Set(tags.map((tag) => tag.name.toLowerCase())),
    [tags],
  );

  const availableTags = React.useMemo(
    () =>
      allTags.filter((tag) => {
        if (selectedKeys.has(tag.name.toLowerCase())) return false;
        if (!queryKey) return true;
        return tag.name.toLowerCase().includes(queryKey);
      }),
    [allTags, queryKey, selectedKeys],
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

  function addTag(tag: QueueTag) {
    const name = tag.name.trim();
    if (!name) return;
    if (tags.some((existing) => existing.name.toLowerCase() === name.toLowerCase())) {
      closePopover();
      return;
    }
    onChange([...tags, { name, color: tag.color }]);
    closePopover();
  }

  function createTag() {
    if (!canCreate) return;
    addTag({ name: normalizedQuery, color });
  }

  function removeTag(name: string) {
    onChange(tags.filter((existing) => existing.name !== name));
  }

  function handleNameKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (canCreate) {
      createTag();
      return;
    }
    const exact = availableTags.find((tag) => tag.name.toLowerCase() === queryKey);
    if (exact) addTag(exact);
    else if (availableTags[0]) addTag(availableTags[0]);
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag) => {
          const tagColor = getTagColor(tag.color);
          return (
            <Badge
              key={tag.name}
              variant="outline"
              className={cn("gap-1 pr-1 text-xs font-medium", tagColor.badge)}
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeTag(tag.name)}
                className="rounded-sm p-0.5 opacity-70 transition-colors hover:bg-black/5 hover:opacity-100"
                aria-label={`Remove tag ${tag.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}

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
              className="h-7 gap-1.5 px-2 text-xs"
            >
              <Tag className="h-3.5 w-3.5" />
              Add tag
              <ChevronsUpDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[22rem] p-0"
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
            <div className="grid grid-cols-[1.35fr_1fr] gap-2 p-3">
              <div className="min-w-0 space-y-1.5">
                <label
                  htmlFor="tag-name"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Tag name
                </label>
                <div className="relative">
                  <Input
                    id="tag-name"
                    ref={nameInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={handleNameKeyDown}
                    placeholder="Search or create…"
                    className="h-9 pr-8 shadow-none"
                    autoComplete="off"
                  />
                  <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
                </div>
              </div>

              <div className="min-w-0 space-y-1.5">
                <label
                  htmlFor="tag-color"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Color
                </label>
                <Select
                  value={color}
                  onValueChange={(value) => setColor(value as TagColorId)}
                >
                  <SelectTrigger id="tag-color" className="h-9 px-2.5 shadow-none">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "h-3 w-3 shrink-0 rounded-full",
                          selectedColor.dot,
                        )}
                      />
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
              {availableTags.length > 0 && (
                <ul className="max-h-44 overflow-y-auto p-1">
                  {availableTags.map((tag) => {
                    const tagColor = getTagColor(tag.color);
                    return (
                      <li key={tag.name}>
                        <button
                          type="button"
                          onClick={() => addTag(tag)}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                        >
                          <span
                            className={cn("h-2.5 w-2.5 shrink-0 rounded-full", tagColor.dot)}
                          />
                          {tag.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {canCreate && (
                <div className={cn(availableTags.length > 0 && "border-t border-border")}>
                  <button
                    type="button"
                    onClick={createTag}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <Plus className="h-4 w-4" />
                    Create “{normalizedQuery}”
                  </button>
                </div>
              )}

              {availableTags.length === 0 && !canCreate && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {normalizedQuery ? "No matching tags." : "No tags yet."}
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
