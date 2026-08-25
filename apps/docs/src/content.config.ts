import { i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { autoSidebarLoader } from "starlight-auto-sidebar/loader";
import { autoSidebarSchema } from "starlight-auto-sidebar/schema";

const frontmatterExtension = z.object({
  // Starlight deep-merges `extend` over its own schema, replacing the field it
  // names — so redeclaring `description` drops the `.optional()` it ships with.
  description: z.string(),
  tier: z.enum(["P0", "P1", "P2"]),
  // No `stable`: pre-1.0 nothing is, so an absent marker is the baseline.
  stability: z.enum(["experimental", "deprecated"]).optional(),
  since: z.string().optional(),
});

// Starlight's `docsLoader()` skips `_`-prefixed files but not `_`-prefixed
// directories, so `_partials/*.mdx` would load as pages and fail the schema
// above. Same rule, extended to directories — and narrowed to the two
// extensions we author in, since every page is `.mdx`.
const docsPattern = ["**/*.{md,mdx}", "!**/_*", "!**/_*/**"];

export const collections = {
  docs: defineCollection({
    loader: glob({ base: "./src/content/docs", pattern: docsPattern }),
    schema: docsSchema({ extend: frontmatterExtension }),
  }),
  // Renames only Starlight's top-of-page link, which ships labelled "Overview"
  // and so reads twice in the right rail of every page carrying the house
  // template's mandatory `## Overview`.
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
  autoSidebar: defineCollection({
    loader: autoSidebarLoader(),
    schema: autoSidebarSchema(),
  }),
};
