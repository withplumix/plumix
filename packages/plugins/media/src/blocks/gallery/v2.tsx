import type { ReactNode } from "react";

import { defineBlockSpec } from "plumix/blocks";

import { clampColumns, normalizeGap, pickAspect } from "./normalize.js";

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

export const galleryBlockV2 = defineBlockSpec({
  name: "media/gallery",
  title: "Gallery",
  category: "media",
  description: "Grid of images with explicit column count and aspect ratio.",
  keywords: ["images", "grid", "photos"],
  inputs: [
    { name: "columns", type: "select", label: "Columns", options: COLUMN_OPTIONS },
    { name: "aspect", type: "select", label: "Aspect ratio", options: ASPECT_OPTIONS },
    { name: "gap", type: "text", label: "Gap" },
    { name: "content", type: "slot", label: "Images" },
  ],
  defaults: { columns: 3, aspect: "1:1", gap: "0.5rem" },
  render: ({ attrs }): ReactNode => {
    const columns = clampColumns(attrs.columns);
    const aspect = pickAspect(attrs.aspect);
    const gap = normalizeGap(attrs.gap);
    const Content = attrs.content as (() => ReactNode) | undefined;
    return (
      <div
        data-columns={columns}
        data-aspect={aspect}
        data-gap={gap}
      >
        {Content ? <Content /> : null}
      </div>
    );
  },
});
