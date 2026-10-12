import { defineConfig } from "eslint/config";

import { baseConfig } from "./base.js";

export default defineConfig(baseConfig, {
  // The rule suite's deliberately violating inputs.
  ignores: ["test/fixtures/**"],
});
