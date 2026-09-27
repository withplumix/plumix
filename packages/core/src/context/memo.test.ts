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

describe("createRequestMemo invalidation", () => {
  const counting = () => {
    const loads: string[] = [];
    const load = (key: string) => () => {
      loads.push(key);
      return Promise.resolve(key);
    };
    return { loads, load };
  };

  test("drops the entries carrying a tag, and only those", async () => {
    const memo = createRequestMemo();
    const { loads, load } = counting();
    await memo("test:a", load("a"), ["e:1"]);
    await memo("test:b", load("b"), ["e:2", "t:post"]);
    await memo("test:c", load("c"));

    memo.invalidate(["t:post"]);
    await memo("test:a", load("a"), ["e:1"]);
    await memo("test:b", load("b"), ["e:2", "t:post"]);
    await memo("test:c", load("c"));

    expect(loads).toEqual(["a", "b", "c", "b"]);
  });

  test("a tag matches whatever case either side spelled it in", async () => {
    const memo = createRequestMemo();
    const { loads, load } = counting();
    await memo("test:typed", load("typed"), ["t:Post"]);

    memo.invalidate(["t:post"]);
    await memo("test:typed", load("typed"), ["t:Post"]);

    expect(loads).toEqual(["typed", "typed"]);
  });

  test("a reload after a drop is itself dropped by the next write", async () => {
    const memo = createRequestMemo();
    const { loads, load } = counting();
    await memo("test:row", load("row"), ["e:1"]);
    memo.invalidate(["e:1"]);
    await memo("test:row", load("row"), ["e:1"]);
    memo.invalidate(["e:1"]);
    await memo("test:row", load("row"), ["e:1"]);

    expect(loads).toEqual(["row", "row", "row"]);
  });

  test("a load that rejects after its entry was dropped leaves the reload in place", async () => {
    const memo = createRequestMemo();
    let fail: (error: Error) => void = () => undefined;
    const failing = memo(
      "test:raced",
      () =>
        new Promise<string>((_, reject) => {
          fail = reject;
        }),
      ["e:1"],
    );
    memo.invalidate(["e:1"]);
    const reloaded = memo("test:raced", () => Promise.resolve("fresh"), [
      "e:1",
    ]);
    fail(new Error("transient"));
    await expect(failing).rejects.toThrow("transient");

    let calls = 0;
    const replay = await memo("test:raced", () => {
      calls += 1;
      return Promise.resolve("again");
    });

    expect(await reloaded).toBe("fresh");
    expect(replay).toBe("fresh");
    expect(calls).toBe(0);
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

  test("the batch is asked only for the ids that missed", async () => {
    const memo = createRequestMemo();
    const asked: (readonly number[])[] = [];
    const loadAll = (missing: readonly number[]) => {
      asked.push(missing);
      return Promise.resolve(
        new Map(missing.map((id) => [id, `row-${String(id)}`])),
      );
    };
    const key = (id: number) => `test:asked:${String(id)}`;

    await memoBatch(memo, [1, 2], key, loadAll);
    const second = await memoBatch(memo, [1, 2, 3], key, loadAll);

    expect(second).toEqual(["row-1", "row-2", "row-3"]);
    expect(asked).toEqual([[1, 2], [3]]);
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

  test("a memoized miss carries its id's tags and loads again once dropped", async () => {
    const memo = createRequestMemo();
    const asked: (readonly number[])[] = [];
    let visible = new Map<number, string>();
    const loadAll = (missing: readonly number[]) => {
      asked.push(missing);
      return Promise.resolve(visible);
    };
    const key = (id: number) => `test:tagged:${String(id)}`;
    const tags = (id: number) => [`e:${String(id)}`];

    expect(await memoBatch(memo, [1, 2], key, loadAll, tags)).toEqual([
      null,
      null,
    ]);
    visible = new Map([[1, "one"]]);
    memo.invalidate(["e:1"]);

    expect(await memoBatch(memo, [1, 2], key, loadAll, tags)).toEqual([
      "one",
      null,
    ]);
    expect(asked).toEqual([[1, 2], [1]]);
  });
});
