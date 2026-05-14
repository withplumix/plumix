import { definePlumixE2EConfig } from "plumix/test/playwright";

export default definePlumixE2EConfig({
  // Distinct per-plugin port so the suite can run in parallel with
  // media (3030) and audit-log (3010) under turbo.
  port: 3040,
  playground: "../playground",
});
