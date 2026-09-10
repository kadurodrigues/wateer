import {
  resolveDragDirection,
  resolveDropIndicator,
  shiftYForDrop,
} from "./queue-drop.ts";

const B = { id: "b", top: 112, bottom: 212 };
const rects = [
  { id: "a", top: 0, bottom: 100 },
  B,
  { id: "c", top: 224, bottom: 324 },
];

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

const grabAtBottom = 200;

assertEqual(
  resolveDropIndicator({
    y: 180,
    grabY: grabAtBottom,
    draggingId: "b",
    rects,
    direction: "up",
  }),
  null,
  "hovering the dragged card itself is not a drop candidate",
);

assertEqual(
  resolveDropIndicator({
    y: 50,
    grabY: grabAtBottom,
    draggingId: "b",
    rects,
    direction: "up",
  }),
  { id: "a", position: "before" },
  "dragging up over a card above inserts before it (that card moves down)",
);

assertEqual(
  resolveDropIndicator({
    y: 80,
    grabY: grabAtBottom,
    draggingId: "b",
    rects,
    direction: "up",
  }),
  { id: "a", position: "before" },
  "dragging up still inserts before the card above, even in its bottom half",
);

assertEqual(
  resolveDropIndicator({
    y: 250,
    grabY: grabAtBottom,
    draggingId: "b",
    rects,
    direction: "down",
  }),
  { id: "c", position: "after" },
  "dragging down over a card below inserts after it (that card moves up)",
);

assertEqual(
  resolveDropIndicator({
    y: 310,
    grabY: grabAtBottom,
    draggingId: "b",
    rects,
    direction: "down",
  }),
  { id: "c", position: "after" },
  "dragging down still inserts after the card below, even in its bottom half",
);

assertEqual(
  resolveDropIndicator({
    y: 50,
    grabY: grabAtBottom,
    draggingId: "b",
    rects,
    direction: null,
  }),
  { id: "a", position: "before" },
  "with no sampled direction yet, compare cursor to the grab point",
);

assertEqual(
  resolveDragDirection({ y: 160, lastY: 200, previous: null }),
  "up",
  "cursor moving up updates direction",
);

assertEqual(
  resolveDragDirection({ y: 204, lastY: 200, previous: "up" }),
  "up",
  "tiny opposite movement keeps the previous direction",
);

assertEqual(
  resolveDropIndicator({
    y: 106,
    grabY: grabAtBottom,
    draggingId: "b",
    rects,
    direction: "up",
  }),
  { id: "a", position: "before" },
  "in the gap, pick the closest card",
);

assertEqual(shiftYForDrop("before", 100), 112, "before shifts the candidate down");
assertEqual(shiftYForDrop("after", 100), -112, "after shifts the candidate up");

if (process.exitCode) {
  process.exit(1);
}
