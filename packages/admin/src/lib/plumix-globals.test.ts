import { afterEach, describe, expect, test } from "vitest";

import { clearManifest, seedManifest } from "../../test/manifest.js";
import { registerPluginBlock } from "./plugin-registry.js";
import { bootPlumixGlobals } from "./plumix-globals.js";

afterEach(() => {
  delete (window as { plumix?: unknown }).plumix;
  clearManifest();
});

describe("plumix globals bridge", () => {
  test("exposes registerPluginBlock as the same function from plugin-registry", () => {
    bootPlumixGlobals();
    expect(window.plumix?.registerPluginBlock).toBe(registerPluginBlock);
  });

  test("publishes the manifest's configured-slot roster", () => {
    const configuredSlots = {
      storage: true,
      imageDelivery: false,
      kv: true,
      cdn: false,
      mailer: false,
    };
    seedManifest({ configuredSlots });
    bootPlumixGlobals();
    expect(window.plumix?.configuredSlots).toEqual(configuredSlots);
  });

  test("publishes every slot as not configured when the manifest names none", () => {
    bootPlumixGlobals();
    expect(window.plumix?.configuredSlots).toEqual({
      storage: false,
      imageDelivery: false,
      kv: false,
      cdn: false,
      mailer: false,
    });
  });
});
