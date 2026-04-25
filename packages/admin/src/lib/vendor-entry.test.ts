import { describe, expect, test } from "vitest";

import { isValidIdentifier, renderVendorEntrySource } from "./vendor-entry.js";

describe("isValidIdentifier", () => {
  test("accepts standard JavaScript identifiers", () => {
    expect(isValidIdentifier("useState")).toBe(true);
    expect(isValidIdentifier("createRoot")).toBe(true);
    expect(isValidIdentifier("$ref")).toBe(true);
    expect(isValidIdentifier("_internal")).toBe(true);
    expect(isValidIdentifier("React")).toBe(true);
  });

  test("rejects strings that aren't legal identifiers", () => {
    expect(isValidIdentifier("with-dash")).toBe(false);
    expect(isValidIdentifier("0lead")).toBe(false);
    expect(isValidIdentifier("has.dot")).toBe(false);
    expect(isValidIdentifier("")).toBe(false);
  });

  test("filters out the synthetic CommonJS interop marker", () => {
    expect(isValidIdentifier("__esModule")).toBe(false);
  });
});

describe("renderVendorEntrySource", () => {
  test("emits the namespace import + named re-exports", () => {
    const src = renderVendorEntrySource(
      "react",
      ["useState", "useEffect"],
      false,
    );
    expect(src).toContain('import * as _ns from "react";');
    expect(src).toContain('export const useState = _ns["useState"];');
    expect(src).toContain('export const useEffect = _ns["useEffect"];');
    expect(src).not.toContain("export default");
  });

  test("re-exports `default` when the namespace carries one", () => {
    const src = renderVendorEntrySource("react", ["useState"], true);
    expect(src).toContain("export default _ns.default;");
  });

  test("works for sub-path specifiers (e.g. react/jsx-runtime)", () => {
    const src = renderVendorEntrySource(
      "react/jsx-runtime",
      ["jsx", "jsxs", "Fragment"],
      false,
    );
    expect(src).toContain('import * as _ns from "react/jsx-runtime";');
    expect(src).toContain('export const Fragment = _ns["Fragment"];');
  });

  test("emits a usable module for an empty named-keys list", () => {
    const src = renderVendorEntrySource("noop", [], true);
    expect(src).toBe(
      'import * as _ns from "noop";\nexport default _ns.default;\n',
    );
  });
});
