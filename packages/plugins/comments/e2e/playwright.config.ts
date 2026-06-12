import { definePlumixE2EConfig } from "plumix/test/playwright";

export default definePlumixE2EConfig({
  // Per-plugin HTTP + workerd inspector ports (convention: 30N0 ↔ 93N0).
  // 3010 audit-log, 3020 blog, 3030 media, 3040 menu, 3050 pages, 3060 here.
  port: 3060,
  inspectorPort: 9360,
  playground: "../playground",
});
