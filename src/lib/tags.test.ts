import { describe, expect, test } from "bun:test";

import {
  addTagToLibrary,
  mergeTagSources,
  removeTagByName,
  removeTagFromLibrary,
  type QueueTag,
} from "./tags.ts";

const focus: QueueTag = { name: "focus", color: "blue" };
const tutorials: QueueTag = { name: "tutorials", color: "green" };

describe("addTagToLibrary", () => {
  test("adds a tag that is not in the library yet", () => {
    expect(addTagToLibrary([focus], tutorials)).toEqual([focus, tutorials]);
  });

  test("ignores a tag whose name is already in the library, whatever the case", () => {
    expect(addTagToLibrary([focus], { name: "FOCUS", color: "red" })).toEqual([focus]);
  });
});

describe("removeTagFromLibrary", () => {
  test("drops the named tag and leaves the rest", () => {
    expect(removeTagFromLibrary([focus, tutorials], "focus")).toEqual([tutorials]);
  });

  test("matches the name whatever the case", () => {
    expect(removeTagFromLibrary([focus, tutorials], "FOCUS")).toEqual([tutorials]);
  });

  test("leaves the library alone when the name is not in it", () => {
    expect(removeTagFromLibrary([focus], "absent")).toEqual([focus]);
  });
});

describe("removeTagByName", () => {
  test("detaches the named tag from a video's tags", () => {
    expect(removeTagByName([focus, tutorials], "tutorials")).toEqual([focus]);
  });

  test("leaves a video that never carried the tag untouched", () => {
    expect(removeTagByName([focus], "tutorials")).toEqual([focus]);
  });
});

describe("mergeTagSources", () => {
  test("returns every tag from both sources, sorted by name", () => {
    expect(mergeTagSources([tutorials], [focus])).toEqual([focus, tutorials]);
  });

  test("keeps a library tag that no video uses", () => {
    expect(mergeTagSources([focus], [])).toEqual([focus]);
  });

  test("keeps a tag applied to a video but missing from the library", () => {
    expect(mergeTagSources([], [focus])).toEqual([focus]);
  });

  test("prefers the library's colour when both sources have the name", () => {
    expect(mergeTagSources([focus], [{ name: "focus", color: "red" }])).toEqual([focus]);
  });
});
