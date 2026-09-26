import { expect, test } from "vitest";

import {
  pluginCatalogStagedPath,
  pluginCatalogUrl,
} from "./plugin-catalog-path.js";

test("pluginCatalogUrl stays in lockstep with pluginCatalogStagedPath", () => {
  // Both ends of the runtime fetch (manifest URL emission + bundler
  // copy destination) consume the same helper. A pattern change must
  // flip both consumers at once or admin's `import()` resolves to a
  // 404 — pin the symmetry so a refactor can't drift them apart.
  expect(pluginCatalogUrl("my-plugin", "de")).toBe(
    `/_plumix/admin/${pluginCatalogStagedPath("my-plugin", "de")}`,
  );
  expect(pluginCatalogStagedPath("my-plugin", "de")).toBe(
    "plugins/my-plugin/locales/de.mjs",
  );
});
