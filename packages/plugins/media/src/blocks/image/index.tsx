import type { BlockSpec } from "plumix/blocks";
import { defineBlock } from "plumix/blocks";

export const imageBlock: BlockSpec = defineBlock({
  name: "media/image",
  title: { id: "plugin.media.block.image.title", message: "Image" },
  icon: "Image",
  category: "media",
  description: {
    id: "plugin.media.block.image.description",
    message: "Image with alt text, caption, and focal-point cropping.",
  },
  keywords: [
    { id: "plugin.media.block.image.keyword.picture", message: "picture" },
    { id: "plugin.media.block.image.keyword.photo", message: "photo" },
    { id: "plugin.media.block.image.keyword.media", message: "media" },
  ],
  inputs: [
    // The picked library asset — a snapshot { id, url, alt, width, height }
    // written by the media picker. Render prefers it; `src` below is the escape
    // hatch for an unmanaged external URL.
    {
      name: "media",
      type: "media",
      content: true,
      label: {
        id: "plugin.media.block.image.input.media.label",
        message: "Image",
      },
      accept: "image/",
    },
    {
      name: "src",
      type: "url",
      label: {
        id: "plugin.media.block.image.input.src.label",
        message: "Source URL",
      },
    },
    {
      name: "alt",
      type: "text",
      content: true,
      label: {
        id: "plugin.media.block.image.input.alt.label",
        message: "Alternative text",
      },
    },
    {
      name: "caption",
      type: "text",
      content: true,
      label: {
        id: "plugin.media.block.image.input.caption.label",
        message: "Caption",
      },
    },
    {
      // An on/off setting → a Switch, consistent with the Styles tab's
      // visibility toggles (the repo's on/off convention).
      name: "priority",
      type: "boolean",
      label: {
        id: "plugin.media.block.image.input.priority.label",
        message: "High priority (load eagerly)",
      },
    },
    // `sizes` and `width` are not authored here: the renderer defaults `sizes`,
    // and width lives in the Styles tab.
    {
      name: "focalPoint",
      type: "focalPoint",
      label: {
        id: "plugin.media.block.image.input.focalPoint.label",
        message: "Focal point",
      },
    },
  ],
  text: [
    { name: "alt", prose: false },
    { name: "caption", prose: false },
  ],
  defaults: {
    media: null,
    src: "",
    alt: "",
    caption: "",
    priority: false,
    focalPoint: { x: 0.5, y: 0.5 },
  },
  view: () => import("./image.view.js"),
});
