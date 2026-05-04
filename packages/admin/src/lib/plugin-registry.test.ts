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
