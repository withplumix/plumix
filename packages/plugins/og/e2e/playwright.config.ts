import { definePlumixE2EConfig } from "plumix/test/playwright";

export default definePlumixE2EConfig({
  // Distinct per-plugin HTTP port + workerd inspector port so the suite can
  // run in parallel with the other plugin playgrounds under turbo. Convention:
  // HTTP 30N0 ↔ inspector 93N0.
  port: 3080,
  inspectorPort: 9380,
  playground: "../playground",
});
