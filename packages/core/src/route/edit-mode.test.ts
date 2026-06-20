import { describe, expect, test } from "vitest";

import { resolveEditMode } from "./edit-mode.js";

describe("resolveEditMode (visual editor edit gate)", () => {
  test("a normal visitor request renders live, ships no runtime, and stays cacheable", () => {
    const decision = resolveEditMode({
      editParam: false,
      canEdit: false,
      previewGrant: false,
    });

    expect(decision).toEqual({
      mode: "live",
      injectRuntime: false,
      bypassCache: false,
    });
  });

  test("a logged-in editor who did NOT request edit still gets the normal cacheable path", () => {
    // Capability alone must not inject the runtime or tax the cache — an
    // author browsing the site normally is just a visitor until they opt in.
    expect(
      resolveEditMode({ editParam: false, canEdit: true, previewGrant: false }),
    ).toEqual({ mode: "live", injectRuntime: false, bypassCache: false });

    expect(
      resolveEditMode({ editParam: false, canEdit: true, previewGrant: true }),
    ).toEqual({ mode: "preview", injectRuntime: false, bypassCache: true });
  });

  test("a valid preview token (no edit param) renders the draft, ships no runtime, and bypasses the cache", () => {
    const decision = resolveEditMode({
      editParam: false,
      canEdit: false,
      previewGrant: true,
    });

    expect(decision).toEqual({
      mode: "preview",
      injectRuntime: false,
      bypassCache: true,
    });
  });

  test("an authorized editor with ?plumix.edit enters edit mode, boots the runtime, and bypasses the cache", () => {
    const decision = resolveEditMode({
      editParam: true,
      canEdit: true,
      previewGrant: false,
    });

    expect(decision).toEqual({
      mode: "edit",
      injectRuntime: true,
      bypassCache: true,
    });
  });

  test("?plumix.edit without the edit capability never boots the runtime (leaked-URL guard)", () => {
    const noGrant = resolveEditMode({
      editParam: true,
      canEdit: false,
      previewGrant: false,
    });
    expect(noGrant).toEqual({
      mode: "live",
      injectRuntime: false,
      bypassCache: false,
    });

    // A preview-link holder (no edit cap) opening ?plumix.edit sees the
    // draft read-only — never the editor.
    const withGrant = resolveEditMode({
      editParam: true,
      canEdit: false,
      previewGrant: true,
    });
    expect(withGrant).toEqual({
      mode: "preview",
      injectRuntime: false,
      bypassCache: true,
    });
  });

  test("an authorized editor enters edit mode even when a preview token is also present (capability wins)", () => {
    const decision = resolveEditMode({
      editParam: true,
      canEdit: true,
      previewGrant: true,
    });

    expect(decision).toEqual({
      mode: "edit",
      injectRuntime: true,
      bypassCache: true,
    });
  });
});
