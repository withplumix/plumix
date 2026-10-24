import { describe, expect, test } from "vitest";

import { createPluginRegistry } from "../plugin/manifest.js";
import { resolveApiTokenPreset } from "./token-presets.js";

describe("resolveApiTokenPreset", () => {
  const plugins = createPluginRegistry();
  plugins.capabilities.set("audit_log:read", {
    name: "audit_log:read",
    minRole: "admin",
    registeredBy: "audit-log",
  });
  plugins.capabilities.set("media:delete", {
    name: "media:delete",
    minRole: "admin",
    registeredBy: "media",
  });

  test("read only keeps the capabilities whose action reads", () => {
    const scopes = resolveApiTokenPreset("read_only", "admin", plugins);

    expect(scopes).toContain("entry:post:read");
    expect(scopes).toContain("entry:post:read_revisions");
    expect(scopes).toContain("user:list");
    expect(scopes).toContain("audit_log:read");
  });

  test("read only drops every capability that writes", () => {
    const scopes = resolveApiTokenPreset("read_only", "admin", plugins);

    expect(scopes).not.toContain("entry:post:create");
    expect(scopes).not.toContain("entry:post:edit_any");
    expect(scopes).not.toContain("entry:post:publish");
    expect(scopes).not.toContain("settings:manage");
  });

  test("draft only drops publish, delete and restore_revision", () => {
    const scopes = resolveApiTokenPreset("draft_only", "admin", plugins);

    expect(scopes).not.toContain("entry:post:publish");
    expect(scopes).not.toContain("entry:post:delete");
    expect(scopes).not.toContain("entry:post:restore_revision");
    expect(scopes).not.toContain("media:delete");
  });

  test("draft only keeps the capabilities that edit", () => {
    const scopes = resolveApiTokenPreset("draft_only", "admin", plugins);

    expect(scopes).toContain("entry:post:create");
    expect(scopes).toContain("entry:post:edit_any");
    expect(scopes).toContain("entry:post:read");
  });

  test("a preset never grants what the role lacks", () => {
    const scopes = resolveApiTokenPreset("draft_only", "author", plugins);

    expect(scopes).not.toContain("settings:manage");
    expect(scopes).not.toContain("entry:post:edit_any");
  });

  test("a role with no capabilities resolves to an empty list, not to everything", () => {
    expect(resolveApiTokenPreset("read_only", "nobody", plugins)).toEqual([]);
    expect(resolveApiTokenPreset("draft_only", "nobody", plugins)).toEqual([]);
  });
});
