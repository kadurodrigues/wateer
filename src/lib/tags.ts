export const TAG_COLOR_IDS = [
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
  "slate",
] as const;

export type TagColorId = (typeof TAG_COLOR_IDS)[number];

export type QueueTag = {
  name: string;
  color: TagColorId;
};

export type TagColorOption = {
  id: TagColorId;
  label: string;
  dot: string;
  badge: string;
};

export const TAG_COLORS: TagColorOption[] = [
  {
    id: "red",
    label: "Red",
    dot: "bg-red-500",
    badge: "border-red-500/25 bg-red-500/15 text-red-800 dark:text-red-300",
  },
  {
    id: "orange",
    label: "Orange",
    dot: "bg-orange-500",
    badge: "border-orange-500/25 bg-orange-500/15 text-orange-800 dark:text-orange-300",
  },
  {
    id: "amber",
    label: "Amber",
    dot: "bg-amber-500",
    badge: "border-amber-500/25 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  {
    id: "green",
    label: "Green",
    dot: "bg-green-500",
    badge: "border-green-500/25 bg-green-500/15 text-green-800 dark:text-green-300",
  },
  {
    id: "teal",
    label: "Teal",
    dot: "bg-teal-500",
    badge: "border-teal-500/25 bg-teal-500/15 text-teal-800 dark:text-teal-300",
  },
  {
    id: "blue",
    label: "Blue",
    dot: "bg-blue-500",
    badge: "border-blue-500/25 bg-blue-500/15 text-blue-800 dark:text-blue-300",
  },
  {
    id: "violet",
    label: "Violet",
    dot: "bg-violet-500",
    badge: "border-violet-500/25 bg-violet-500/15 text-violet-800 dark:text-violet-300",
  },
  {
    id: "pink",
    label: "Pink",
    dot: "bg-pink-500",
    badge: "border-pink-500/25 bg-pink-500/15 text-pink-800 dark:text-pink-300",
  },
  {
    id: "slate",
    label: "Slate",
    dot: "bg-slate-500",
    badge: "border-slate-500/25 bg-slate-500/15 text-slate-800 dark:text-slate-300",
  },
];

export const DEFAULT_TAG_COLOR: TagColorId = "red";

export function isTagColorId(value: unknown): value is TagColorId {
  return typeof value === "string" && (TAG_COLOR_IDS as readonly string[]).includes(value);
}

export function getTagColor(id: TagColorId | undefined): TagColorOption {
  return TAG_COLORS.find((color) => color.id === id) ?? TAG_COLORS[0]!;
}

export function normalizeTags(tags: unknown): QueueTag[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const result: QueueTag[] = [];

  for (const tag of tags) {
    let name = "";
    let color: TagColorId = DEFAULT_TAG_COLOR;

    if (typeof tag === "string") {
      name = tag.trim();
    } else if (tag && typeof tag === "object" && "name" in tag) {
      name = String((tag as { name?: unknown }).name ?? "").trim();
      const rawColor = (tag as { color?: unknown }).color;
      if (isTagColorId(rawColor)) color = rawColor;
    }

    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ name, color });
  }

  return result;
}
