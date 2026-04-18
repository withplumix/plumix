import { describe, expect, test } from "vitest";

import config from "../plumix.config.js";

describe("examples/minimal plumix.config", () => {
  test("runtime and database are wired", () => {
    expect(config.runtime.name).toBe("cloudflare");
    expect(config.database.kind).toBe("d1");
  });

  test("auth is a plumix-kind config with passkey origin matching the dev port", () => {
    expect(config.auth.kind).toBe("plumix");
    expect(config.auth.passkey.origin).toBe("http://localhost:8787");
  });

  test("exposes cloudflare commandsModule for the CLI", () => {
    expect(config.runtime.commandsModule).toBe(
      "@plumix/runtime-cloudflare/commands",
    );
  });
});
