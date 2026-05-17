import { defineBlock } from "plumix/blocks";

export const fileBlock = defineBlock({
  name: "media/file",
  title: "File",
  category: "media",
  description: "Downloadable file with size + MIME label.",
  keywords: ["download", "attachment"],
  attributes: {
    mediaId: { type: "text", label: "Media id", default: "" },
    href: { type: "url", label: "Download URL", default: "" },
    filename: { type: "text", label: "Filename", default: "" },
    size: { type: "number", label: "Size (bytes)", default: 0 },
    mime: { type: "text", label: "MIME type", default: "" },
    thumbnail: { type: "url", label: "Preview thumbnail URL", default: "" },
  },
  supports: {
    color: { background: true },
    spacing: { padding: true, margin: true },
    border: { radius: true },
    anchor: true,
    customClassName: true,
  },
  schema: () => import("./schema.js").then((m) => m.fileSchema),
  component: () => import("./Component.js").then((m) => m.FileComponent),
});
