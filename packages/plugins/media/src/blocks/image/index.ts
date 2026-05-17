import { defineBlock } from "plumix/blocks";

const SIZING_OPTIONS = [
  { value: "full", label: "Full width" },
  { value: "wide", label: "Wide" },
  { value: "narrow", label: "Narrow" },
  { value: "thumbnail", label: "Thumbnail" },
] as const;

export const imageBlock = defineBlock({
  name: "media/image",
  title: "Image",
  category: "media",
  description: "Image with alt text, caption, and focal-point cropping.",
  keywords: ["picture", "photo", "media"],
  attributes: {
    mediaId: { type: "text", label: "Media id", default: "" },
    src: { type: "url", label: "Source URL", default: "" },
    srcset: { type: "text", label: "Source set", default: "" },
    alt: { type: "text", label: "Alternative text", default: "" },
    caption: { type: "text", label: "Caption", default: "" },
    sizing: {
      type: "select",
      label: "Sizing",
      default: "full",
      options: SIZING_OPTIONS,
    },
    // focalPoint is a structured `{ x, y }` slot edited via the
    // NodeView's focal-point picker; the Inspector doesn't render a
    // direct control for it.
    focalPoint: {
      type: "json",
      label: "Focal point",
      default: { x: 0.5, y: 0.5 },
    },
  },
  supports: {
    spacing: { padding: true, margin: true },
    border: { radius: true },
    anchor: true,
    customClassName: true,
  },
  client: {
    src: "/_plumix/admin/assets/media-image.client.js",
  },
  schema: () => import("./schema.js").then((m) => m.imageSchema),
  component: () => import("./Component.js").then((m) => m.ImageComponent),
});
