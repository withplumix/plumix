// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightAutoSidebar from "starlight-auto-sidebar";
import starlightLinksValidator from "starlight-links-validator";
import starlightLlmsTxt from "starlight-llms-txt";

export default defineConfig({
  site: "https://docs.plumix.dev",
  integrations: [
    starlight({
      title: "Plumix",
      description:
        "Documentation for Plumix, a modern headless CMS built for the edge.",
      // English-only content, but declaring the locale keeps the tree shaped
      // for translation.
      locales: {
        root: { label: "English", lang: "en" },
      },
      // Keeps a roster page's right rail a section index rather than a list as
      // long as the page. Pages override in frontmatter.
      tableOfContents: { maxHeadingLevel: 2 },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/withplumix/plumix",
        },
      ],
      plugins: [
        // No `sidebar` key above: Starlight autogenerates the tree from
        // `src/content/docs`, shaped by the `_meta.yml` files this plugin reads.
        starlightAutoSidebar(),
        // The first two are the plugin's current defaults, restated so an
        // upstream change to either cannot silently remove the gate — the exact
        // decay this exists to catch.
        //
        // `sameSitePolicy` is not a default: rejecting same-origin links leaves
        // root-absolute as the only way to write a cross-reference, which is
        // what makes a roster item's anchor a checkable contract (#1855).
        starlightLinksValidator({
          errorOnInvalidHashes: true,
          failOnError: true,
          sameSitePolicy: "error",
        }),
        // Set even though it currently defaults to the same string: the
        // generated files name the software, and the site may rename itself.
        starlightLlmsTxt({ projectName: "Plumix" }),
      ],
    }),
  ],
});
