export function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const copy = [...array];
  const [removed] = copy.splice(from, 1);
  if (removed === undefined) return array;
  copy.splice(to, 0, removed);
  return copy;
}

export function reorderMatching<T extends { id: string }>(
  items: T[],
  match: (item: T) => boolean,
  sourceId: string,
  targetId: string,
  position?: "before" | "after",
): T[] | null {
  const sectionItems = items.filter(match);
  const from = sectionItems.findIndex((item) => item.id === sourceId);
  const target = sectionItems.findIndex((item) => item.id === targetId);
  if (from === -1 || target === -1) return null;
  let to = position === "after" ? target + 1 : target;
  // `to` counts the source's own slot; once the source is lifted out, later slots shift up.
  if (from < to) to -= 1;
  const reordered = arrayMove(sectionItems, from, to);
  let index = 0;
  return items.map((item) => (match(item) ? reordered[index++]! : item));
}
