import { HookRegistry, installPlugins } from "plumix/plugin";
import { expect, test } from "vitest";

import { media } from "../index.js";
import * as adminEntry from "./index.js";

// The bundler resolves each `component` off this module only at build time.
// Kept apart so the server suites don't pay the admin bundle's import.
test("exports every component the plugin declares a field type with", async () => {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [media()],
  });

  for (const fieldType of registry.fieldTypes.values()) {
    if (fieldType.registeredBy !== "media") continue;
    expect(adminEntry).toHaveProperty(fieldType.component);
  }
});
