import { HookRegistry, installPlugins } from "plumix/plugin";
import { expect, test } from "vitest";

import { seo } from "../index.js";
import { SERP_PREVIEW_INPUT_TYPE } from "../preview-box.js";
import * as adminEntry from "./index.js";

// The bundler resolves `component` off this module only at build time; kept
// apart so the server suites don't pay the admin bundle's import.
test("exports the component the plugin declares the preview with", async () => {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [seo()],
  });

  expect(adminEntry).toHaveProperty(
    registry.fieldTypes.get(SERP_PREVIEW_INPUT_TYPE)?.component ?? "",
  );
});
