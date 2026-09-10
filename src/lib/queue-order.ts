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
  let to = sectionItems.findIndex((item) => item.id === targetId);
  if (from === -1 || to === -1) return null;
  if (position === "after") {
    to += 1;
    if (to > sectionItems.length) to = sectionItems.length;
  }
  const reordered = arrayMove(sectionItems, from, to);
  let index = 0;
  return items.map((item) => (match(item) ? reordered[index++]! : item));
}
