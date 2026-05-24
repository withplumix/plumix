import { describe, expect, test } from "vitest";

import { deserializeProps, PROP_TYPE, serializeProps } from "./serialize.js";

describe("serializeProps / deserializeProps", () => {
  test("round-trips a plain string under PROP_TYPE.Value", () => {
    const serialized = serializeProps({ title: "hello" });
    const parsed = JSON.parse(serialized) as Record<
      string,
      readonly [number, unknown]
    >;
    expect(parsed.title?.[0]).toBe(PROP_TYPE.Value);
    expect(parsed.title?.[1]).toBe("hello");
    expect(deserializeProps(serialized)).toEqual({ title: "hello" });
  });

  test("round-trips a nested plain object", () => {
    const props = { user: { name: "Ada", age: 36 } };
    expect(deserializeProps(serializeProps(props))).toEqual(props);
  });

  test("round-trips an array of primitives via PROP_TYPE.JSON", () => {
    const props = { tags: ["alpha", "beta", "gamma"] };
    const serialized = serializeProps(props);
    const parsed = JSON.parse(serialized) as Record<
      string,
      readonly [number, unknown]
    >;
    expect(parsed.tags?.[0]).toBe(PROP_TYPE.JSON);
    expect(deserializeProps(serialized)).toEqual(props);
  });

  test("round-trips Date", () => {
    const d = new Date("2026-01-01T12:00:00.000Z");
    const out = deserializeProps(serializeProps({ when: d })) as {
      when: Date;
    };
    expect(out.when).toBeInstanceOf(Date);
    expect(out.when.toISOString()).toBe(d.toISOString());
  });

  test("round-trips RegExp", () => {
    const re = /^hello\b/gi;
    const out = deserializeProps(serializeProps({ pattern: re })) as {
      pattern: RegExp;
    };
    expect(out.pattern).toBeInstanceOf(RegExp);
    expect(out.pattern.source).toBe(re.source);
    expect(out.pattern.flags).toBe(re.flags);
  });

  test("round-trips Map and Set", () => {
    const m = new Map<string, number>([
      ["a", 1],
      ["b", 2],
    ]);
    const s = new Set<string>(["x", "y"]);
    const out = deserializeProps(serializeProps({ m, s })) as {
      m: Map<string, number>;
      s: Set<string>;
    };
    expect(out.m).toBeInstanceOf(Map);
    expect([...out.m.entries()]).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(out.s).toBeInstanceOf(Set);
    expect([...out.s.values()]).toEqual(["x", "y"]);
  });

  test("round-trips BigInt and URL", () => {
    const big = 9007199254740993n;
    const u = new URL("https://plumix.dev/path?q=1");
    const out = deserializeProps(serializeProps({ big, u })) as {
      big: bigint;
      u: URL;
    };
    expect(out.big).toBe(big);
    expect(out.u).toBeInstanceOf(URL);
    expect(out.u.toString()).toBe(u.toString());
  });

  test("round-trips typed arrays (Uint8/16/32)", () => {
    const u8 = new Uint8Array([1, 2, 3]);
    const u16 = new Uint16Array([1000, 2000]);
    const u32 = new Uint32Array([100000, 200000]);
    const out = deserializeProps(serializeProps({ u8, u16, u32 })) as {
      u8: Uint8Array;
      u16: Uint16Array;
      u32: Uint32Array;
    };
    expect(Array.from(out.u8)).toEqual([1, 2, 3]);
    expect(Array.from(out.u16)).toEqual([1000, 2000]);
    expect(Array.from(out.u32)).toEqual([100000, 200000]);
  });

  test("round-trips +Infinity and -Infinity", () => {
    const out = deserializeProps(
      serializeProps({ pos: Infinity, neg: -Infinity }),
    ) as { pos: number; neg: number };
    expect(out.pos).toBe(Infinity);
    expect(out.neg).toBe(-Infinity);
  });

  test("throws on cyclic refs with the component displayName in the message", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() =>
      serializeProps({ value: a }, { displayName: "SearchBlock" }),
    ).toThrow(/SearchBlock/);
  });

  test("a shared (non-cyclic) reference threaded through two slots is fine", () => {
    const shared = { color: "blue", weight: 700 };
    const props = { header: { theme: shared }, footer: { theme: shared } };
    expect(() => serializeProps(props)).not.toThrow();
    expect(deserializeProps(serializeProps(props))).toEqual(props);
  });

  test("PROP_TYPE enum values are byte-identical to Astro", () => {
    expect(PROP_TYPE.Value).toBe(0);
    expect(PROP_TYPE.JSON).toBe(1);
    expect(PROP_TYPE.RegExp).toBe(2);
    expect(PROP_TYPE.Date).toBe(3);
    expect(PROP_TYPE.Map).toBe(4);
    expect(PROP_TYPE.Set).toBe(5);
    expect(PROP_TYPE.BigInt).toBe(6);
    expect(PROP_TYPE.URL).toBe(7);
    expect(PROP_TYPE.Uint8Array).toBe(8);
    expect(PROP_TYPE.Uint16Array).toBe(9);
    expect(PROP_TYPE.Uint32Array).toBe(10);
    expect(PROP_TYPE.Infinity).toBe(11);
  });
});
