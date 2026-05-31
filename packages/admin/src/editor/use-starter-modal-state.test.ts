import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { PatternManifestEntry } from "@plumix/core/manifest";

import { useStarterModalState } from "./use-starter-modal-state.js";

const blank = (name: string): PatternManifestEntry => ({
  name,
  title: name,
  content: [],
  target: "post-content",
});

describe("useStarterModalState", () => {
  test("opens when the entry is initially empty and candidates exist", () => {
    const { result } = renderHook(() =>
      useStarterModalState({
        initiallyEmpty: true,
        candidates: [blank("a")],
      }),
    );

    expect(result.current.open).toBe(true);
  });

  test("stays closed when the entry has content even with candidates", () => {
    const { result } = renderHook(() =>
      useStarterModalState({
        initiallyEmpty: false,
        candidates: [blank("a")],
      }),
    );

    expect(result.current.open).toBe(false);
  });

  test("stays closed when there are no candidates", () => {
    const { result } = renderHook(() =>
      useStarterModalState({
        initiallyEmpty: true,
        candidates: [],
      }),
    );

    expect(result.current.open).toBe(false);
  });

  test("dismiss closes; reopen reopens when candidates exist", () => {
    const { result } = renderHook(() =>
      useStarterModalState({
        initiallyEmpty: true,
        candidates: [blank("a")],
      }),
    );

    act(() => result.current.dismiss());
    expect(result.current.open).toBe(false);

    act(() => result.current.reopen());
    expect(result.current.open).toBe(true);
  });

  test("reopen is a no-op when there are no candidates", () => {
    const { result } = renderHook(() =>
      useStarterModalState({
        initiallyEmpty: true,
        candidates: [],
      }),
    );

    act(() => result.current.reopen());
    expect(result.current.open).toBe(false);
  });
});
