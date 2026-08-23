import type { SchemaContext } from "astro:content";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { autoSidebarLoader } from "starlight-auto-sidebar/loader";
import { autoSidebarSchema } from "starlight-auto-sidebar/schema";

const frontmatterExtension = ({ image }: SchemaContext) =>
  z.object({
    // Starlight deep-merges `extend` over its own schema, replacing the field it
    // names — so redeclaring `description` drops the `.optional()` it ships with.
    description: z.string(),
    tier: z.enum(["P0", "P1", "P2"]),
    // No `stable`: pre-1.0 nothing is, so an absent marker is the baseline.
    stability: z.enum(["experimental", "deprecated"]).optional(),
    since: z.string().optional(),
    // A single-theme screenshot is unreadable for half of readers, so the two
    // sources are grouped to be required together. Grouping is what makes that
    // structural: `extend` takes a `ZodObject`, so a `.refine()` pairing two
    // optional fields is out, and the union that would work instead means
    // restating every other field in both branches.
    screenshot: z
      .object({ light: image(), dark: image(), alt: z.string().min(1) })
      .optional(),
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
  autoSidebar: defineCollection({
    loader: autoSidebarLoader(),
    schema: autoSidebarSchema(),
  }),
};
