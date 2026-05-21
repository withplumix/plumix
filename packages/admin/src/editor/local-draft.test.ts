import type { Data } from "@puckeditor/core";
import { afterEach, describe, expect, test, vi } from "vitest";

import { readDraft, writeDraft } from "./local-draft.js";

const KEY = "plumix.v2.draft.test.test-key";

const sample: Data = {
  content: [
    {
      type: "core/heading",
      props: { id: "h1", text: "Hello", level: 2 },
    },
  ] as Data["content"],
  root: { props: {} },
};

afterEach(() => {
  localStorage.clear();
});

describe("local-draft round-trip", () => {
  test("writeDraft persists data so the next readDraft returns it", () => {
    writeDraft(KEY, sample);
    expect(readDraft(KEY)).toEqual(sample);
  });

  test("readDraft returns undefined when the key is missing", () => {
    expect(readDraft(KEY)).toBeUndefined();
  });

  test("readDraft returns undefined when the stored value is malformed JSON", () => {
    localStorage.setItem(KEY, "{not-json");
    expect(readDraft(KEY)).toBeUndefined();
  });

  test("readDraft returns undefined when the parsed value is not Puck-shaped", () => {
    localStorage.setItem(KEY, JSON.stringify({ content: "nope", root: null }));
    expect(readDraft(KEY)).toBeUndefined();
  });

  test("writeDraft swallows storage errors instead of crashing", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("setItem failed");
      });
    try {
      expect(() => writeDraft(KEY, sample)).not.toThrow();
    } finally {
      setItem.mockRestore();
    }
  });
});
