import { definePlumixE2EConfig } from "plumix/test/playwright";

export default definePlumixE2EConfig({
  // Distinct per-plugin port so the suite can run in parallel with
  // menu (3040) and media (3030) under turbo.
  port: 3010,
  playground: "../playground",
});
