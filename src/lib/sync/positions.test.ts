import { describe, expect, test } from "bun:test";

import { assignPositions } from "./positions.ts";

const known = (entries: Record<string, number>) => new Map(Object.entries(entries));
const sorted = (positions: Map<string, number>) =>
  [...positions].sort((a, b) => a[1] - b[1]).map(([id]) => id);

describe("assignPositions", () => {
  test("numbers a list that has no positions yet", () => {
    const { positions, changed } = assignPositions(["a", "b", "c"], new Map());
    expect(sorted(positions)).toEqual(["a", "b", "c"]);
    expect(changed).toEqual(["a", "b", "c"]);
  });

  test("leaves an unchanged order alone", () => {
    expect(assignPositions(["a", "b", "c"], known({ a: 1, b: 2, c: 3 })).changed).toEqual([]);
  });

  test("moving one video touches only that video", () => {
    const { positions, changed } = assignPositions(
      ["b", "c", "a", "d"],
      known({ a: 1, b: 2, c: 3, d: 4 }),
    );
    expect(changed).toEqual(["a"]);
    expect(sorted(positions)).toEqual(["b", "c", "a", "d"]);
  });

  test("appends, prepends and inserts new videos around existing ones", () => {
    const { positions, changed } = assignPositions(
      ["new1", "a", "new2", "b", "new3"],
      known({ a: 1, b: 2 }),
    );
    expect(changed.sort()).toEqual(["new1", "new2", "new3"]);
    expect(sorted(positions)).toEqual(["new1", "a", "new2", "b", "new3"]);
  });

  test("drops positions of removed videos", () => {
    const { positions } = assignPositions(["a", "c"], known({ a: 1, b: 2, c: 3 }));
    expect([...positions.keys()]).toEqual(["a", "c"]);
  });

  test("renumbers when repeated inserts run out of room", () => {
    let positions = known({ a: 1, b: 2 });
    let order = ["a", "b"];
    for (let i = 0; i < 60; i += 1) {
      order = ["a", `n${i}`, ...order.slice(1)];
      positions = assignPositions(order, positions).positions;
    }
    expect(sorted(positions)).toEqual(order);
    const values = sorted(positions).map((id) => positions.get(id)!);
    expect(new Set(values).size).toBe(values.length);
  });
});
