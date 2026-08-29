import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clearProgress,
  foldStepAnswers,
  progressKey,
  readProgress,
  writeProgress,
} from "./form-progress.js";

// The platform boundary, stubbed rather than mocked away: these are the
// four calls the plugin makes against session storage, and a browser
// that refuses them is the case the island has to survive.
function stubStorage(entries: Record<string, string> = {}): void {
  const held = new Map(Object.entries(entries));
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => held.set(key, value),
    removeItem: (key: string) => held.delete(key),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const form = (entries: [string, string][]): FormData => {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
};

describe("folding a step's answers into the ones behind it", () => {
  test("carries every answer from a step that is no longer on screen", () => {
    const folded = foldStepAnswers("name=Ada", form([["subject", "Hello"]]));

    expect(new URLSearchParams(folded).get("name")).toBe("Ada");
    expect(new URLSearchParams(folded).get("subject")).toBe("Hello");
  });

  test("replaces what a step being answered again said before", () => {
    const folded = foldStepAnswers("name=Ada", form([["name", "Grace"]]));

    expect(new URLSearchParams(folded).getAll("name")).toEqual(["Grace"]);
  });

  test("keeps every answer a field of many gave", () => {
    const folded = foldStepAnswers(
      "",
      form([
        ["topics", "a"],
        ["topics", "b"],
      ]),
    );

    expect(new URLSearchParams(folded).getAll("topics")).toEqual(["a", "b"]);
  });

  test("takes an emptied answer as the answer", () => {
    const folded = foldStepAnswers("news=on", form([["news", ""]]));

    expect(new URLSearchParams(folded).getAll("news")).toEqual([""]);
  });
});

describe("progress across a reload", () => {
  test("comes back as it was stored", () => {
    stubStorage();
    const key = progressKey("contact", "plumix-form-node");

    writeProgress(key, { step: 2, body: "name=Ada" });

    expect(readProgress(key)).toEqual({ step: 2, body: "name=Ada" });
  });

  test("is absent for a form nobody has started", () => {
    stubStorage();

    expect(readProgress(progressKey("contact", "plumix-form-node"))).toBeNull();
  });

  test("is not shared by two forms the same block node has held", () => {
    expect(progressKey("contact", "node")).not.toBe(
      progressKey("survey", "node"),
    );
  });

  test("is refused when the entry is not what this plugin wrote", () => {
    stubStorage({ "plumix-form:node": '{"step":"two"}' });

    expect(readProgress("plumix-form:node")).toBeNull();
  });

  test("is refused when the entry is not JSON at all", () => {
    stubStorage({ "plumix-form:node": "{" });

    expect(readProgress("plumix-form:node")).toBeNull();
  });

  test("is gone once the submission has been made", () => {
    stubStorage();
    const key = progressKey("contact", "node");
    writeProgress(key, { step: 1, body: "name=Ada" });

    clearProgress(key);

    expect(readProgress(key)).toBeNull();
  });

  test("costs the visitor nothing where the browser refuses site data", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });

    expect(() => {
      writeProgress("k", { step: 1, body: "" });
    }).not.toThrow();
    expect(readProgress("k")).toBeNull();
  });
});
