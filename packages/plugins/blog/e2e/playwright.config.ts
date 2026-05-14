import { definePlumixE2EConfig } from "plumix/test/playwright";

export default definePlumixE2EConfig({
  // Distinct per-plugin port so the suite can run in parallel with
  // audit-log (3010), media (3030), and menu (3040) under turbo.
  port: 3020,
  playground: "../playground",
});
