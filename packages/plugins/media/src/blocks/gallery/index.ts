import { defineBlock } from "plumix/blocks";

const COLUMN_OPTIONS = [
  { value: 2, label: "2 columns" },
  { value: 3, label: "3 columns" },
  { value: 4, label: "4 columns" },
  { value: 6, label: "6 columns" },
] as const;

const ASPECT_OPTIONS = [
  { value: "1:1", label: "Square" },
  { value: "4:3", label: "4:3" },
  { value: "3:2", label: "3:2" },
  { value: "16:9", label: "16:9" },
  { value: "auto", label: "Auto (image-native)" },
] as const;

export const galleryBlock = defineBlock({
  name: "media/gallery",
  title: "Gallery",
  category: "media",
  description: "Grid of images with explicit column count and aspect ratio.",
  keywords: ["images", "grid", "photos"],
  attributes: {
    columns: {
      type: "select",
      label: "Columns",
      default: 3,
      options: COLUMN_OPTIONS,
    },
    aspect: {
      type: "select",
      label: "Aspect ratio",
      default: "1:1",
      options: ASPECT_OPTIONS,
    },
    gap: { type: "text", label: "Gap", default: "0.5rem" },
  },
  supports: {
    spacing: { padding: true, margin: true },
    anchor: true,
    customClassName: true,
  },
  schema: () => import("./schema.js").then((m) => m.gallerySchema),
  component: () => import("./Component.js").then((m) => m.GalleryComponent),
});
