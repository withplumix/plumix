import { definePlumixE2EConfig } from "plumix/test/playwright";

export default definePlumixE2EConfig({
  // See `packages/plugins/audit-log/e2e/playwright.config.ts` for why
  // each playground assigns its own HTTP + inspector port.
  port: 3050,
  inspectorPort: 9350,
  playground: "../playground",
});
