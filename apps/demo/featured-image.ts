import { definePlugin } from "plumix/plugin";

import { media } from "@plumix/plugin-media/fields";

/**
 * A theme has no setup hook, so a site that needs one registration of its own
 * declares it as a one-file plugin like this.
 */
export const featuredImage = definePlugin("demo-featured-image", (ctx) => {
  ctx.registerEntryMetaBox("featured_image", {
    label: "Featured image",
    entryTypes: ["post"],
    fields: [
      media("featuredImage")
        .label("Cover")
        .description("Shown on cards, on the post, and as the share image.")
        .featured(),
    ],
  });
});
