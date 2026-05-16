import { definePlumixE2EConfig } from "plumix/test/playwright";

export default definePlumixE2EConfig({
  // Distinct per-plugin HTTP port + workerd inspector port so the
  // suite can run in parallel with the other plugin playgrounds under
  // turbo. Convention: HTTP 30N0 ↔ inspector 93N0 (3010↔9310,
  // 3020↔9320, …). `@cloudflare/vite-plugin` otherwise auto-allocates
  // inspector ports from 9229 upward and collides under parallelism.
  port: 3010,
  inspectorPort: 9310,
  playground: "../playground",
});
