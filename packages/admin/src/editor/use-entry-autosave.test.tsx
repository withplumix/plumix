import type { ReactNode } from "react";
import { orpc } from "@/lib/orpc.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { AppRouterClient } from "@plumix/core";
import { RpcReplyError } from "@plumix/core/test";

import type { AutosaveGroup } from "./use-entry-autosave.js";
import { settleRpc, stubRpc } from "../../test/rpc.js";
import { AUTOSAVE_DEBOUNCE_MS } from "./autosave.js";
import { useEntryAutosave } from "./use-entry-autosave.js";

type EntryRow = Awaited<ReturnType<AppRouterClient["entry"]["get"]>>;

const T0 = new Date("2026-05-20T00:00:00.000Z");
const T1 = new Date("2026-05-20T00:00:01.000Z");
const T2 = new Date("2026-05-20T00:00:02.000Z");

function row(overrides: Partial<EntryRow> = {}): EntryRow {
  return {
    id: 1,
    type: "post",
    parentId: null,
    title: "Hello",
    slug: "hello",
    content: null,
    excerpt: null,
    status: "draft",
    authorId: 1,
    sortOrder: 0,
    publishedAt: null,
    createdAt: T0,
    updatedAt: T0,
    meta: {},
    terms: {},
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }): ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// A title field whose current value the test sets directly — the group reads
// it at write time, as a route reads its refs.
function titleField(initial = "Hello"): {
  value: string;
  readonly group: AutosaveGroup<string>;
} {
  const field = {
    value: initial,
    group: {
      initial,
      snapshot: () => field.value,
      diff: (saved: string, next: string) =>
        saved === next ? null : { title: next },
      commit: (_saved: string, next: string) => next,
    },
  };
  return field;
}

function staleConflict(): RpcReplyError {
  return new RpcReplyError("CONFLICT", {
    status: 409,
    data: { reason: "stale_expected_updated_at" },
  });
}

function renderAutosave(
  groups: { readonly title: AutosaveGroup<string> },
  onError: (err: unknown) => void = () => undefined,
) {
  return renderHook(
    () =>
      useEntryAutosave({
        id: 1,
        entryType: "post",
        liveUpdatedAt: T0,
        onError,
        groups,
      }),
    { wrapper },
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useEntryAutosave", () => {
  test("runExclusive sends a pending edit first and hands the task its token", async () => {
    const rpc = stubRpc({
      "entry/update": () => row({ updatedAt: T1 }),
      "entry/publish": () => ({
        ...row({ status: "published", updatedAt: T2 }),
        meta: {},
      }),
    });
    const title = titleField();
    const { result } = renderAutosave({ title: title.group });

    title.value = "Hello world";
    act(() => result.current.schedule.title());
    await act(() =>
      result.current.runExclusive((expectedLiveUpdatedAt) =>
        orpc.entry.publish.call({ id: 1, expectedLiveUpdatedAt }),
      ),
    );

    expect(rpc.calls.map((call) => call.procedure)).toEqual([
      "entry/update",
      "entry/publish",
    ]);
    expect(rpc.lastCallTo("entry/update")?.input).toEqual({
      id: 1,
      title: "Hello world",
      expectedLiveUpdatedAt: T0,
    });
    expect(rpc.lastCallTo("entry/publish")?.input).toEqual({
      id: 1,
      expectedLiveUpdatedAt: T1,
    });
  });

  test("a stale-token conflict re-anchors and retries exactly once", async () => {
    let updates = 0;
    const rpc = stubRpc({
      "entry/update": () => {
        updates += 1;
        if (updates === 1) throw staleConflict();
        return row({ updatedAt: T2 });
      },
      "entry/get": () => row({ updatedAt: T1 }),
    });
    const title = titleField();
    const onError = vi.fn();
    const { result } = renderAutosave({ title: title.group }, onError);

    title.value = "Hello world";
    act(() => result.current.schedule.title());
    await act(() => result.current.flush());

    const writes = rpc.calls.filter((c) => c.procedure === "entry/update");
    expect(writes.map((c) => c.input)).toEqual([
      { id: 1, title: "Hello world", expectedLiveUpdatedAt: T0 },
      { id: 1, title: "Hello world", expectedLiveUpdatedAt: T1 },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  test("a conflict that survives the retry is not retried again", async () => {
    const rpc = stubRpc({
      "entry/update": () => {
        throw staleConflict();
      },
      "entry/get": () => row({ updatedAt: T1 }),
    });
    const title = titleField();
    const { result } = renderAutosave({ title: title.group });

    title.value = "Hello world";
    act(() => result.current.schedule.title());
    await act(() => result.current.flush());

    expect(
      rpc.calls.filter((c) => c.procedure === "entry/update"),
    ).toHaveLength(2);
  });

  test("a genuine failure reports once across failing ticks and a success re-arms it", async () => {
    const outcomes = ["fail", "fail", "ok", "fail"];
    stubRpc({
      "entry/update": () => {
        if (outcomes.shift() === "fail") throw new Error("boom");
        return row({ updatedAt: T1 });
      },
    });
    const title = titleField();
    const onError = vi.fn();
    const { result } = renderAutosave({ title: title.group }, onError);

    for (const value of ["a", "b", "c", "d"]) {
      title.value = value;
      act(() => result.current.schedule.title());
      await act(() => result.current.flush());
      if (value === "b") expect(onError).toHaveBeenCalledTimes(1);
    }

    expect(onError).toHaveBeenCalledTimes(2);
  });

  test("a write that lands on the autosave row leaves the live token alone", async () => {
    let updates = 0;
    const rpc = stubRpc({
      "entry/update": () => {
        updates += 1;
        return updates === 1
          ? row({ type: "autosave", updatedAt: T2 })
          : row({ updatedAt: T1 });
      },
    });
    const title = titleField();
    const { result } = renderAutosave({ title: title.group });

    for (const value of ["draft edit", "second edit"]) {
      title.value = value;
      act(() => result.current.schedule.title());
      await act(() => result.current.flush());
    }

    expect(rpc.lastCallTo("entry/update")?.input).toMatchObject({
      title: "second edit",
      expectedLiveUpdatedAt: T0,
    });
  });

  test("unmounting sends a pending edit", async () => {
    const rpc = stubRpc({ "entry/update": () => row({ updatedAt: T1 }) });
    const title = titleField();
    const { result, unmount } = renderAutosave({ title: title.group });

    title.value = "Hello world";
    act(() => result.current.schedule.title());
    unmount();
    await settleRpc();

    expect(rpc.lastCallTo("entry/update")?.input).toMatchObject({
      title: "Hello world",
    });
  });

  test("cancel drops a pending edit so unmounting sends nothing", async () => {
    const rpc = stubRpc({ "entry/update": () => row({ updatedAt: T1 }) });
    const title = titleField();
    const { result, unmount } = renderAutosave({ title: title.group });

    title.value = "Hello world";
    act(() => result.current.schedule.title());
    act(() => result.current.cancel());
    unmount();
    await settleRpc();

    expect(rpc.calls).toEqual([]);
  });

  test("an edit is sent after the debounce window of quiet, not before", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const rpc = stubRpc({ "entry/update": () => row({ updatedAt: T1 }) });
    const title = titleField();
    const { result } = renderAutosave({ title: title.group });

    title.value = "Hello world";
    act(() => result.current.schedule.title());
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1));
    expect(rpc.calls).toEqual([]);
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(rpc.lastCallTo("entry/update")?.input).toMatchObject({
      title: "Hello world",
    });
  });
});
