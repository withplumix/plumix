import { expect, test } from "vitest";

import {
  pluginCatalogStagedPath,
  pluginCatalogUrl,
} from "./plugin-catalog-path.js";

test("pluginCatalogUrl stays in lockstep with pluginCatalogStagedPath", () => {
  // Manifest URL and bundler copy destination must agree, or admin's
  // `import()` resolves to a 404.
  expect(pluginCatalogUrl("my-plugin", "de")).toBe(
    `/_plumix/admin/${pluginCatalogStagedPath("my-plugin", "de")}`,
  );
  expect(pluginCatalogStagedPath("my-plugin", "de")).toBe(
    "plugins/my-plugin/locales/de.mjs",
  );
});
