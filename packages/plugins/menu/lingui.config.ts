import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "uk", "ar"],
  catalogs: [
    {
      path: "<rootDir>/locales/{locale}",
      include: ["src"],
    },
  ],
  format: formatter({ lineNumbers: false }),
});
