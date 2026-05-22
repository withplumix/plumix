import { afterEach, describe, expect, test } from "vitest";

import type { BlockSpec } from "@plumix/blocks";

import {
  _resetPluginRegistry,
  getPluginBlockEditor,
  getPluginBlockSchema,
  getPluginFieldType,
  getPluginMarkSchema,
  getPluginPage,
  getRegisteredBlocks,
  registerPluginBlock,
  registerPluginBlockEditor,
  registerPluginBlockSchema,
  registerPluginFieldType,
  registerPluginMarkSchema,
  registerPluginPage,
} from "./plugin-registry.js";

const Stub = () => null;

afterEach(() => {
  _resetPluginRegistry();
});

describe("plugin page registry", () => {
  test("stores + retrieves a registered component", () => {
    registerPluginPage("/menus", Stub);
    expect(getPluginPage("/menus")).toBe(Stub);
  });

  test("returns undefined for unknown paths", () => {
    expect(getPluginPage("/unknown")).toBeUndefined();
  });

  test("throws when registering the same path twice", () => {
    registerPluginPage("/menus", Stub);
    expect(() => registerPluginPage("/menus", Stub)).toThrow(
      /already registered/,
    );
  });
});

describe("plugin field-type registry", () => {
  test("round-trips a field-type renderer", () => {
    registerPluginFieldType("media_picker", Stub);
    expect(getPluginFieldType("media_picker")).toBe(Stub);
  });

  test("rejects duplicates", () => {
    registerPluginFieldType("custom_field", Stub);
    expect(() => registerPluginFieldType("custom_field", Stub)).toThrow(
      /already registered/,
    );
  });

  test("rejects built-in inputType names (reservation guards both accidental + malicious overrides)", () => {
    expect(() => registerPluginFieldType("text", Stub)).toThrow(/reserved/);
    expect(() => registerPluginFieldType("number", Stub)).toThrow(/reserved/);
    expect(() => registerPluginFieldType("checkbox", Stub)).toThrow(/reserved/);
    expect(() => registerPluginFieldType("user", Stub)).toThrow(/reserved/);
    expect(() => registerPluginFieldType("entry", Stub)).toThrow(/reserved/);
    expect(() => registerPluginFieldType("term", Stub)).toThrow(/reserved/);
    expect(() => registerPluginFieldType("userList", Stub)).toThrow(/reserved/);
  });

  test("plugin-shipped reference types (media) are not reserved — duplicate detection is enough", () => {
    // `media` is plugin-shipped (`@plumix/plugin-media`); reserving it
    // would block the very plugin that owns it. Two media plugins
    // would still conflict via `already registered`.
    registerPluginFieldType("media", Stub);
    expect(getPluginFieldType("media")).toBe(Stub);
    expect(() => registerPluginFieldType("media", Stub)).toThrow(
      /already registered/,
    );
  });
});

describe("plugin block + mark registries", () => {
  const schema = { name: "acme/callout" } as never;

  test("round-trips block schemas + editors + mark schemas", () => {
    registerPluginBlockSchema("acme/callout", schema);
    expect(getPluginBlockSchema("acme/callout")).toBe(schema);

    registerPluginBlockEditor("acme/callout", Stub);
    expect(getPluginBlockEditor("acme/callout")).toBe(Stub);

    const markSchema = { name: "acme/highlight" } as never;
    registerPluginMarkSchema("acme/highlight", markSchema);
    expect(getPluginMarkSchema("acme/highlight")).toBe(markSchema);
  });

  test("returns undefined for unknown names", () => {
    expect(getPluginBlockSchema("acme/nope")).toBeUndefined();
    expect(getPluginBlockEditor("acme/nope")).toBeUndefined();
    expect(getPluginMarkSchema("acme/nope")).toBeUndefined();
  });

  test("rejects duplicate registrations per registry", () => {
    registerPluginBlockSchema("acme/callout", schema);
    expect(() => registerPluginBlockSchema("acme/callout", schema)).toThrow(
      /already registered/,
    );
    registerPluginBlockEditor("acme/callout", Stub);
    expect(() => registerPluginBlockEditor("acme/callout", Stub)).toThrow(
      /already registered/,
    );
    registerPluginMarkSchema("acme/highlight", schema);
    expect(() => registerPluginMarkSchema("acme/highlight", schema)).toThrow(
      /already registered/,
    );
  });
});

describe("v2 block registry", () => {
  const spec = { name: "acme/banner" } as BlockSpec;

  test("round-trips a registered BlockSpec via getRegisteredBlocks()", () => {
    registerPluginBlock(spec);
    expect(getRegisteredBlocks()).toEqual([spec]);
  });

  test("rejects two specs registered under the same name", () => {
    registerPluginBlock(spec);
    expect(() => registerPluginBlock(spec)).toThrow(/already registered/);
  });

  test("rejects a spec whose name is not namespaced (no slash)", () => {
    expect(() =>
      registerPluginBlock({ name: "banner" } as BlockSpec),
    ).toThrow(/namespaced string/);
  });

  test("preserves registration order so the inserter UI is deterministic", () => {
    const a = { name: "acme/a" } as BlockSpec;
    const b = { name: "acme/b" } as BlockSpec;
    const c = { name: "acme/c" } as BlockSpec;
    registerPluginBlock(b);
    registerPluginBlock(a);
    registerPluginBlock(c);
    expect(getRegisteredBlocks().map((s) => s.name)).toEqual([
      "acme/b",
      "acme/a",
      "acme/c",
    ]);
  });

  test("getRegisteredBlocks() returns a snapshot, not a live view", () => {
    registerPluginBlock(spec);
    const snapshot = getRegisteredBlocks();
    registerPluginBlock({ name: "acme/extra" } as BlockSpec);
    expect(snapshot).toHaveLength(1);
  });
});
