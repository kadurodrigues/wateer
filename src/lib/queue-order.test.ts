import { reorderMatching } from "./queue-order.ts";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL ${label}\n  expected: ${e}\n  actual:   ${a}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok   ${label}`);
}

const items = [
  { id: "r1", list: "queue" },
  { id: "b1", list: "bookmarks" },
  { id: "r2", list: "queue" },
  { id: "b2", list: "bookmarks" },
  { id: "b3", list: "bookmarks" },
];

const isBookmark = (item: (typeof items)[number]) => item.list === "bookmarks";

assertEqual(
  reorderMatching(items, isBookmark, "b1", "b3", "after")?.map((i) => i.id),
  ["r1", "b2", "r2", "b3", "b1"],
  "moving a bookmark after another leaves queue items in place",
);

assertEqual(
  reorderMatching(items, isBookmark, "b3", "b1", "before")?.map((i) => i.id),
  ["r1", "b3", "r2", "b1", "b2"],
  "moving a bookmark before another keeps relative queue order",
);

assertEqual(
  reorderMatching(items, isBookmark, "b1", "r1", "after"),
  null,
  "dropping onto an item outside the section is ignored",
);

const list = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
const all = () => true;
const order = (source: string, target: string, position: "before" | "after") =>
  reorderMatching(list, all, source, target, position)?.map((i) => i.id);

assertEqual(order("a", "b", "after"), ["b", "a", "c", "d"], "moving down after the next item");
assertEqual(order("a", "c", "after"), ["b", "c", "a", "d"], "moving down after a later item");
assertEqual(order("a", "c", "before"), ["b", "a", "c", "d"], "moving down before a later item");
assertEqual(order("d", "b", "before"), ["a", "d", "b", "c"], "moving up before an earlier item");
assertEqual(order("d", "b", "after"), ["a", "b", "d", "c"], "moving up after an earlier item");
assertEqual(
  order("b", "a", "after"),
  ["a", "b", "c", "d"],
  "dropping into its own slot is a no-op",
);

if (process.exitCode) {
  process.exit(process.exitCode);
}
