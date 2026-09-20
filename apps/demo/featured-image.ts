import { definePlugin } from "plumix/plugin";

import { media } from "@plumix/plugin-media/fields";

/**
 * The box an author picks a post's cover in. `.featured()` puts the field in
 * core's `featured` image role, which is what the theme reads as
 * `entry.images.featured` — no meta key crosses the boundary.
 *
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
