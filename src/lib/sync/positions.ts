/**
 * Sort keys for the synced queue. Each video stores a `position`; the app's order is
 * the videos sorted by it. After a local change, give new positions to as few videos
 * as possible: keep the longest run already in order, and slot the rest between
 * their neighbours.
 */

/** Below this gap, midpoints stop being distinguishable; renumber everything instead. */
const MIN_GAP = 1e-6;

export type PositionUpdate = {
  positions: Map<string, number>;
  /** Ids whose position is new or different from `known`. */
  changed: string[];
};

export function assignPositions(order: string[], known: Map<string, number>): PositionUpdate {
  const keep = longestIncreasingRun(order, known);
  const positions = new Map<string, number>();
  const changed: string[] = [];

  let index = 0;
  while (index < order.length) {
    const id = order[index]!;
    if (keep.has(id)) {
      positions.set(id, known.get(id)!);
      index += 1;
      continue;
    }
    // A run of ids that need positions, between two kept neighbours (or the ends).
    const start = index;
    while (index < order.length && !keep.has(order[index]!)) index += 1;
    const run = order.slice(start, index);
    const before = start > 0 ? positions.get(order[start - 1]!) : undefined;
    const after = index < order.length ? known.get(order[index]!) : undefined;
    const slots = spread(run.length, before, after);
    if (!slots) return renumber(order, known);
    run.forEach((runId, i) => {
      positions.set(runId, slots[i]!);
      if (known.get(runId) !== slots[i]) changed.push(runId);
    });
  }
  return { positions, changed };
}

/** `count` evenly spaced values strictly between `low` and `high`; null if too cramped. */
function spread(count: number, low?: number, high?: number): number[] | null {
  if (low === undefined && high === undefined) {
    return Array.from({ length: count }, (_, i) => i + 1);
  }
  if (high === undefined) return Array.from({ length: count }, (_, i) => low! + i + 1);
  if (low === undefined) return Array.from({ length: count }, (_, i) => high - (count - i));
  const step = (high - low) / (count + 1);
  if (step < MIN_GAP) return null;
  return Array.from({ length: count }, (_, i) => low + step * (i + 1));
}

function renumber(order: string[], known: Map<string, number>): PositionUpdate {
  const positions = new Map(order.map((id, i) => [id, i + 1] as const));
  return { positions, changed: order.filter((id) => known.get(id) !== positions.get(id)) };
}

/** Ids forming the longest subsequence of `order` whose known positions increase. */
function longestIncreasingRun(order: string[], known: Map<string, number>): Set<string> {
  const ids = order.filter((id) => known.has(id));
  // Patience sorting: tails[k] is the index (into ids) ending the best run of length k+1.
  const tails: number[] = [];
  const previous: number[] = new Array(ids.length).fill(-1);
  ids.forEach((id, i) => {
    const value = known.get(id)!;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (known.get(ids[tails[mid]!]!)! < value) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) previous[i] = tails[lo - 1]!;
    tails[lo] = i;
  });
  const run = new Set<string>();
  for (let i = tails.at(-1) ?? -1; i !== -1; i = previous[i]!) run.add(ids[i]!);
  return run;
}
