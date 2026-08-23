import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection, z } from "astro:content";

const frontmatterExtension = z.object({
  // Starlight deep-merges `extend` over its own schema, replacing the field it
  // names — so redeclaring `description` drops the `.optional()` it ships with.
  description: z.string(),
  tier: z.enum(["P0", "P1", "P2"]),
  // No `stable`: pre-1.0 nothing is, so an absent marker is the baseline.
  stability: z.enum(["experimental", "deprecated"]).optional(),
  since: z.string().optional(),
});

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({ extend: frontmatterExtension }),
  }),
};
