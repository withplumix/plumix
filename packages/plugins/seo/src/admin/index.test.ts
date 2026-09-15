import { HookRegistry, installPlugins } from "plumix/plugin";
import { expect, test } from "vitest";

import { seo } from "../index.js";
import { SERP_PREVIEW_INPUT_TYPE } from "../preview-box.js";
import * as adminEntry from "./index.js";

// The bundler resolves the declared `component` as a named export off this
// module, and only at build time. Kept apart from the server suites so they
// don't pay the admin bundle's import.
test("exports the component the plugin declares the preview with", async () => {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [seo()],
  });

  expect(adminEntry).toHaveProperty(
    registry.fieldTypes.get(SERP_PREVIEW_INPUT_TYPE)?.component ?? "",
  );
});
