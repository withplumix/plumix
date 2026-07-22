import { describe, expect, test } from "vitest";

import { createRequestMemo, memoBatch } from "./memo.js";

describe("createRequestMemo", () => {
  test("runs the loader once per key and replays the result", async () => {
    const memo = createRequestMemo();
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve({ value: calls });
    };

    const first = await memo("test:answer", load);
    const second = await memo("test:answer", load);

    expect(calls).toBe(1);
    expect(second).toBe(first);
  });

  test("concurrent callers with the same key share one in-flight load", async () => {
    const memo = createRequestMemo();
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve("row");
    };

    const [first, second] = await Promise.all([
      memo("test:concurrent", load),
      memo("test:concurrent", load),
    ]);

    expect(calls).toBe(1);
    expect(first).toBe("row");
    expect(second).toBe("row");
  });

  test("keys are independent and memos are isolated from each other", async () => {
    const memo = createRequestMemo();
    const other = createRequestMemo();
    const loads: string[] = [];
    const load = (tag: string) => () => {
      loads.push(tag);
      return Promise.resolve(tag);
    };

    await memo("test:a", load("a"));
    await memo("test:b", load("b"));
    await other("test:a", load("a-other"));

    expect(loads).toEqual(["a", "b", "a-other"]);
  });

  test("a rejected load is not memoized — the next call retries", async () => {
    const memo = createRequestMemo();
    let calls = 0;
    const load = () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("transient"))
        : Promise.resolve("recovered");
    };

    await expect(memo("test:retry", load)).rejects.toThrow("transient");
    await expect(memo("test:retry", load)).resolves.toBe("recovered");
    expect(calls).toBe(2);
  });
});

describe("memoBatch", () => {
  test("misses share one batched load; later calls replay per id", async () => {
    const memo = createRequestMemo();
    let batches = 0;
    const loadAll = (pairs: readonly (readonly [number, string])[]) => () => {
      batches += 1;
      return Promise.resolve(new Map(pairs));
    };
    const key = (id: number) => `test:row:${String(id)}`;

    const first = await memoBatch(
      memo,
      [1, 2],
      key,
      loadAll([
        [1, "one"],
        [2, "two"],
      ]),
    );
    expect(first).toEqual(["one", "two"]);
    expect(batches).toBe(1);

    // 1 replays from the memo; only the miss (3) triggers the new batch.
    const second = await memoBatch(memo, [1, 3], key, loadAll([[3, "three"]]));
    expect(second).toEqual(["one", "three"]);
    expect(batches).toBe(2);

    // All hits → the batch never runs.
    const third = await memoBatch(memo, [2, 3], key, loadAll([]));
    expect(third).toEqual(["two", "three"]);
    expect(batches).toBe(2);
  });

  test("ids absent from the loaded map memoize as null", async () => {
    const memo = createRequestMemo();
    let batches = 0;
    const loadAll = () => {
      batches += 1;
      return Promise.resolve(new Map<number, string>());
    };
    const key = (id: number) => `test:missing:${String(id)}`;

    expect(await memoBatch(memo, [9], key, loadAll)).toEqual([null]);
    expect(await memoBatch(memo, [9], key, loadAll)).toEqual([null]);
    expect(batches).toBe(1);
  });
});
