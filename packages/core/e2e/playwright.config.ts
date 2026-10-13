import { definePlumixE2EConfig } from "@plumix/core/test/playwright";

// From core's own `test/playwright`, not `plumix/test/playwright`: core cannot
// depend on `plumix`, which depends on it.
export default definePlumixE2EConfig({
  port: 3140,
  inspectorPort: 9420,
  configDir: import.meta.dirname,
  playground: "../playground",
});
