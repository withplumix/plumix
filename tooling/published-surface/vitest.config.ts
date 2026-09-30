import { mergeConfig } from "vitest/config";

import { baseConfig } from "@plumix/vitest-config/base";

// The `test:unit` tier: suites that read the repo's files and need no build.
// The shared base already leaves `*.build.test.ts` to `vitest.build.config.ts`.
export default mergeConfig(baseConfig, {
  test: { coverage: { include: ["readme.ts"] } },
});
