import { defineConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

// The suite guards the component roster, which the sync script under
// `scripts/` owns; `src/` is vendored shadcn with no tests of its own.
export default defineConfig(baseConfig);
