import { defineBlock } from "plumix/blocks";

import { embedParsePasteRules } from "./schema.js";

export const embedBlock = defineBlock({
  name: "media/embed",
  title: "Embed",
  category: "media",
  description:
    "oEmbed-style embed for YouTube, Vimeo, Twitter/X, Spotify, CodePen, Loom.",
  keywords: ["video", "tweet", "iframe", "oembed"],
  attributes: {
    url: { type: "url", label: "Share URL", default: "" },
    title: { type: "text", label: "Accessible title", default: "" },
  },
  supports: {
    spacing: { padding: true, margin: true },
    border: { radius: true },
    anchor: true,
    customClassName: true,
  },
  parsePaste: embedParsePasteRules,
  client: {
    src: "/_plumix/admin/assets/media-embed.client.js",
  },
  schema: () => import("./schema.js").then((m) => m.embedSchema),
  component: () => import("./Component.js").then((m) => m.EmbedComponent),
});
