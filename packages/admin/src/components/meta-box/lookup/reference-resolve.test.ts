import { describe, expect, test } from "vitest";

import { planReferenceResolve, referenceStatus } from "./reference-resolve.js";

describe("planReferenceResolve", () => {
  test("fully hydrated ids skip the resolve round-trip", () => {
    expect(
      planReferenceResolve({
        kind: "user",
        ids: ["1", "2"],
        initialSelected: [
          { id: "1", label: "Ada" },
          { id: "2", label: "Bo" },
        ],
      }).enabled,
    ).toBe(false);
  });

  test("un-hydrated ids resolve in one batched call", () => {
    expect(
      planReferenceResolve({
        kind: "user",
        ids: ["1", "2"],
        initialSelected: [{ id: "1", label: "Ada" }],
      }),
    ).toEqual({
      input: { kind: "user", scope: undefined, ids: ["1", "2"] },
      enabled: true,
    });
  });

  test("an empty selection does not fetch", () => {
    expect(
      planReferenceResolve({ kind: "user", ids: [], initialSelected: [] })
        .enabled,
    ).toBe(false);
  });
});

describe("referenceStatus", () => {
  test("a hydrated prefill is found without a resolve", () => {
    expect(
      referenceStatus("1", {
        prefill: [{ id: "1", label: "Ada" }],
        items: [],
        pending: false,
      }),
    ).toEqual({ status: "found", item: { id: "1", label: "Ada" } });
  });

  test("a resolved row is found", () => {
    expect(
      referenceStatus("2", {
        prefill: [{ id: "1", label: "Ada" }],
        items: [{ id: "2", label: "Bo" }],
        pending: false,
      }),
    ).toEqual({ status: "found", item: { id: "2", label: "Bo" } });
  });

  test("a live resolve overrides the hydrated prefill", () => {
    expect(
      referenceStatus("1", {
        prefill: [{ id: "1", label: "Ada" }],
        items: [{ id: "1", label: "Ada Lovelace" }],
        pending: false,
      }),
    ).toEqual({ status: "found", item: { id: "1", label: "Ada Lovelace" } });
  });

  test("a row is pending while the resolve is in flight, never a premature orphan", () => {
    expect(
      referenceStatus("1", { prefill: [], items: [], pending: true }),
    ).toEqual({ status: "pending" });
  });

  test("a row the settled resolve didn't return is an orphan", () => {
    expect(
      referenceStatus("2", {
        prefill: [],
        items: [{ id: "1", label: "Ada" }],
        pending: false,
      }),
    ).toEqual({ status: "orphan" });
  });
});
