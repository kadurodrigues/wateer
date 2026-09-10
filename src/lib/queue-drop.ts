export type DropRect = { id: string; top: number; bottom: number };
export type DropPosition = "before" | "after";
export type DragDirection = "up" | "down";

export type DropIndicator = {
  id: string;
  position: DropPosition;
};

const DIRECTION_THRESHOLD_PX = 4;

export function resolveDragDirection({
  y,
  lastY,
  previous,
}: {
  y: number;
  lastY: number;
  previous: DragDirection | null;
}): DragDirection | null {
  const delta = y - lastY;
  if (delta < -DIRECTION_THRESHOLD_PX) return "up";
  if (delta > DIRECTION_THRESHOLD_PX) return "down";
  return previous;
}

/**
 * Pick the insertion point while dragging.
 *
 * Hovering another card uses drag direction, not the card midpoint:
 * moving up inserts before that card (it should slide down);
 * moving down inserts after that card (it should slide up).
 * The dragged card itself is never a candidate.
 */
export function resolveDropIndicator({
  y,
  grabY,
  draggingId,
  rects,
  direction,
}: {
  y: number;
  grabY: number;
  draggingId: string;
  rects: DropRect[];
  direction: DragDirection | null;
}): DropIndicator | null {
  if (rects.length === 0) return null;

  const target = closestRect(y, rects);

  if (target.id === draggingId) return null;

  const goingUp = direction === "up" || (direction !== "down" && y < grabY);
  return { id: target.id, position: goingUp ? "before" : "after" };
}

function closestRect(y: number, rects: DropRect[]): DropRect {
  let best = rects[0]!;
  let bestDist = distanceToRect(y, best);
  for (const rect of rects.slice(1)) {
    const dist = distanceToRect(y, rect);
    if (dist < bestDist) {
      best = rect;
      bestDist = dist;
    }
  }
  return best;
}

function distanceToRect(y: number, rect: DropRect): number {
  if (y < rect.top) return rect.top - y;
  if (y > rect.bottom) return y - rect.bottom;
  return 0;
}

export const QUEUE_CARD_GAP_PX = 12;

export function shiftYForDrop(
  position: DropPosition,
  cardHeight: number,
): number {
  const distance = cardHeight + QUEUE_CARD_GAP_PX;
  return position === "before" ? distance : -distance;
}
