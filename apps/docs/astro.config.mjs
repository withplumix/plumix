// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";
import starlightLlmsTxt from "starlight-llms-txt";

// Scaffold config: one placeholder page. The real sidebar, content, and
// semver-aware versioning land with the docs-site follow-up to #1425.
export default defineConfig({
  site: "https://docs.plumix.dev",
  integrations: [
    starlight({
      title: "Plumix",
      description:
        "Documentation for Plumix, a modern headless CMS built for the edge.",
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
        // Set even though it currently defaults to the same string: the
        // generated files name the software, and the site may rename itself.
        starlightLlmsTxt({ projectName: "Plumix" }),
      ],
    }),
  ],
});
