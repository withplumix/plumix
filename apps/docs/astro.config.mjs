// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";

// Scaffold config: title + one placeholder page. The real sidebar, content, and
// semver-aware versioning land with the docs-site follow-up to #1425.
export default defineConfig({
  integrations: [
    starlight({
      title: "Plumix",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/withplumix/plumix",
        },
      ],
      plugins: [
        // Both are the plugin's current defaults, restated so an upstream
        // change to either cannot silently remove the gate — the exact decay
        // this exists to catch.
        starlightLinksValidator({
          errorOnInvalidHashes: true,
          failOnError: true,
        }),
      ],
    }),
  ],
});
