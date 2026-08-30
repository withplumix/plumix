// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightAutoSidebar from "starlight-auto-sidebar";
import starlightLinksValidator from "starlight-links-validator";
import starlightLlmsTxt from "starlight-llms-txt";

export default defineConfig({
  site: "https://docs.plumix.dev",
  // The site has no splash page: the IA spec makes Getting Started's
  // Introduction the front door, so `/` lands there rather than on a second
  // page competing to be first.
  redirects: { "/": "/getting-started/introduction/" },
  integrations: [
    starlight({
      title: "Plumix",
      description: "Documentation for Plumix, a modern CMS built for the edge.",
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
        starlightLlmsTxt({
          // Set even though it currently defaults to the same string: the
          // generated files name the software, and the site may rename itself.
          projectName: "Plumix",
          // Starlight gives every heading an anchor link carrying a screen
          // reader's "Section titled …", which lands beside every heading once
          // converted back to markdown.
          customSelectors: { all: ["a.sl-anchor-link"] },
          // The custom-set route asks for minified output and offers no way to
          // decline, and collapsing whitespace folds every heading into the
          // paragraph before it, costing an agent the structure it navigates
          // by. Off here, where it is configurable, so a set reads like the
          // page it came from.
          //
          // `caution` and `danger` already default to `false`. They are pinned
          // rather than restated: the tree carries 33 cautions and 3 dangers,
          // among them the pre-1.0 warning most pages embed, and an upstream
          // flip of either default would drop those from every agent-facing
          // file without a word.
          minify: { whitespace: false, caution: false, danger: false },
          // Sorted by id otherwise, which opens Getting Started on
          // Configuration and reaches Introduction fourth — the reverse of
          // what its own description promises. Setting this replaces the
          // plugin's default rather than extending it, so `index*` stays.
          promote: ["**/introduction", "**/overview", "index*"],
          // `llms.txt` calls this file abridged, in a string the plugin
          // hardcodes. That has to be earned: these are the exhaustive
          // reference rosters, which is what an agent short of context can
          // most afford to fetch separately. Applies to `llms-small.txt`
          // alone.
          exclude: [
            "fields/field-types",
            "blocks/core-blocks",
            "themes/rule-kinds",
            "plugins/seo",
            "plugins/og",
          ],
          // Without these, `llms.txt` is an index of nothing: it lists the two
          // whole-corpus dumps and no page, leaving an agent to read the entire
          // documentation to answer a question about one area.
          //
          // One set per sidebar section, in the order the sections carry in
          // their `_meta.yml`. A section with no pages yet is absent rather
          // than linked to an empty file — add it here with its first page.
          customSets: [
            {
              label: "Getting Started",
              paths: ["getting-started/**"],
              description:
                "installing Plumix, the config file, what the scaffolder writes, and a first deploy",
            },
            {
              label: "Content Modelling",
              paths: ["content-modelling/**"],
              description:
                "entry types, taxonomies and the four statuses an entry moves between",
            },
            {
              label: "Fields",
              paths: ["fields/**"],
              description:
                "meta boxes and the fluent builders that declare a field and its storage contract",
            },
            {
              label: "Blocks",
              paths: ["blocks/**"],
              description:
                "the block tree an entry's content is stored as, and every block Plumix registers",
            },
            {
              label: "Themes",
              paths: ["themes/**"],
              description:
                "theme descriptors, the template hierarchy, and the data a template receives",
            },
            {
              label: "Routing",
              paths: ["routing/**"],
              description:
                "how a URL resolves to a rendered page, and how a permalink is composed",
            },
            {
              // "and", not "&": the set's URL is slugged from this label, and an
              // ampersand slugs to a double dash.
              label: "Access and Identity",
              paths: ["access/**"],
              description:
                "how a request resolves to a principal, and passkey sign-in",
            },
            {
              label: "Going Further",
              paths: ["going-further/**"],
              description:
                "the dev-server surfaces a deployed site does not expose",
            },
            {
              label: "Deployment",
              paths: ["deployment/**"],
              description:
                "the Cloudflare adapter, bindings, secrets, and the deploy sequence",
            },
            {
              label: "Plugins",
              paths: ["plugins/**"],
              description:
                "installing a published plugin, and a reference for each plugin Plumix ships",
            },
          ],
        }),
      ],
    }),
  ],
});
