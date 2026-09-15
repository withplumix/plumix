import { HookRegistry, installPlugins } from "plumix/plugin";
import { expect, test } from "vitest";

import { media } from "../index.js";
import * as adminEntry from "./index.js";

// The bundler resolves each declared `component` as a named export off this
// module, and only at build time. Kept apart from the server suites so they
// don't pay the admin bundle's import.
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
