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
  { id: "r1", list: "recent" },
  { id: "b1", list: "bookmarks" },
  { id: "r2", list: "recent" },
  { id: "b2", list: "bookmarks" },
  { id: "b3", list: "bookmarks" },
];

const isBookmark = (item: (typeof items)[number]) => item.list === "bookmarks";

assertEqual(
  reorderMatching(items, isBookmark, "b1", "b3", "after")?.map((i) => i.id),
  ["r1", "b2", "r2", "b3", "b1"],
  "moving a bookmark after another leaves recent items in place",
);

assertEqual(
  reorderMatching(items, isBookmark, "b3", "b1", "before")?.map((i) => i.id),
  ["r1", "b3", "r2", "b1", "b2"],
  "moving a bookmark before another keeps relative recent order",
);

assertEqual(
  reorderMatching(items, isBookmark, "b1", "r1", "after"),
  null,
  "dropping onto an item outside the section is ignored",
);

if (process.exitCode) {
  process.exit(process.exitCode);
}
