// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

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
    }),
  ],
});
