import { afterEach, describe, expect, test } from "vitest";

import {
  _resetPluginRegistry,
  getPluginBlock,
  getPluginFieldType,
  getPluginPage,
  registerPluginBlock,
  registerPluginFieldType,
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

describe("plugin block registry", () => {
  test("round-trips a block component", () => {
    registerPluginBlock("image", Stub);
    expect(getPluginBlock("image")).toBe(Stub);
  });

  test("rejects duplicates", () => {
    registerPluginBlock("image", Stub);
    expect(() => registerPluginBlock("image", Stub)).toThrow(
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
    registerPluginFieldType("color", Stub);
    expect(() => registerPluginFieldType("color", Stub)).toThrow(
      /already registered/,
    );
  });
});
