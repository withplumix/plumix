import { describe, expect, test } from "vitest";

import { KvError } from "./errors.js";
import { kv } from "./kv.js";

// Minimal in-test fake of the Workers KV namespace binding.
function fakeNamespace() {
  const store = new Map<string, string>();
  const calls: { putOpts?: unknown; listOpts?: unknown } = {};
  return {
    store,
    calls,
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    put: (key: string, value: string, opts?: unknown) => {
      calls.putOpts = opts;
      store.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
    list: (opts?: unknown) => {
      calls.listOpts = opts;
      return Promise.resolve({
        keys: [{ name: "a" }, { name: "b" }],
        list_complete: false,
        cursor: "next-cursor",
      });
    },
  };
}

describe("kv", () => {
  test("exposes kind, config, and requiredBindings", () => {
    const adapter = kv({ binding: "SESSIONS" });
    expect(adapter.kind).toBe("kv");
    expect(adapter.config.binding).toBe("SESSIONS");
    expect(adapter.requiredBindings).toEqual(["SESSIONS"]);
  });

  test("connect throws when the binding is missing", () => {
    expect(() => kv({ binding: "SESSIONS" }).connect({})).toThrow(KvError);
  });

  test("get/put/delete round-trip through the binding", async () => {
    const ns = fakeNamespace();
    const store = kv({ binding: "SESSIONS" }).connect({ SESSIONS: ns });
    expect(await store.get("k")).toBeNull();
    await store.put("k", "v");
    expect(await store.get("k")).toBe("v");
    await store.delete("k");
    expect(await store.get("k")).toBeNull();
  });

  test("put forwards expirationTtl to the binding", async () => {
    const ns = fakeNamespace();
    const store = kv({ binding: "SESSIONS" }).connect({ SESSIONS: ns });
    await store.put("k", "v", { expirationTtl: 3600 });
    expect(ns.calls.putOpts).toEqual({ expirationTtl: 3600 });
  });

  test("put omits options when no ttl is given", async () => {
    const ns = fakeNamespace();
    const store = kv({ binding: "SESSIONS" }).connect({ SESSIONS: ns });
    await store.put("k", "v");
    expect(ns.calls.putOpts).toBeUndefined();
  });

  test("list maps the binding shape onto the KV contract", async () => {
    const ns = fakeNamespace();
    const store = kv({ binding: "SESSIONS" }).connect({ SESSIONS: ns });
    const result = await store.list({ prefix: "u:", limit: 10 });
    expect(result.keys).toEqual(["a", "b"]);
    expect(result.listComplete).toBe(false);
    expect(result.cursor).toBe("next-cursor");
    expect(ns.calls.listOpts).toEqual({
      prefix: "u:",
      limit: 10,
      cursor: undefined,
    });
  });

  test("list drops the cursor when the listing is complete", async () => {
    const ns = {
      ...fakeNamespace(),
      list: () =>
        Promise.resolve({ keys: [{ name: "a" }], list_complete: true }),
    };
    const store = kv({ binding: "SESSIONS" }).connect({ SESSIONS: ns });
    const result = await store.list();
    expect(result.keys).toEqual(["a"]);
    expect(result.listComplete).toBe(true);
    expect(result.cursor).toBeUndefined();
  });
});
