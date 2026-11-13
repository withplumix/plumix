import type { BlockSpec } from "plumix/blocks";
import { defineBlock } from "plumix/blocks";

export const fileBlock: BlockSpec = defineBlock({
  name: "media/file",
  title: { id: "plugin.media.block.file.title", message: "File" },
  icon: "File",
  category: "media",
  description: {
    id: "plugin.media.block.file.description",
    message: "Downloadable file with size + MIME label.",
  },
  keywords: [
    { id: "plugin.media.block.file.keyword.download", message: "download" },
    { id: "plugin.media.block.file.keyword.attachment", message: "attachment" },
  ],
  inputs: [
    // The picked library asset — a { id, url, filename, mime } snapshot the
    // media picker writes. The fields below are manual escape hatches /
    // overrides.
    {
      name: "media",
      type: "media",
      label: {
        id: "plugin.media.block.file.input.media.label",
        message: "File",
      },
    },
    {
      name: "href",
      type: "url",
      label: {
        id: "plugin.media.block.file.input.href.label",
        message: "Download URL",
      },
    },
    {
      name: "filename",
      type: "text",
      label: {
        id: "plugin.media.block.file.input.filename.label",
        message: "Filename",
      },
    },
    {
      name: "size",
      type: "number",
      label: {
        id: "plugin.media.block.file.input.size.label",
        message: "Size (bytes)",
      },
    },
    {
      name: "mime",
      type: "text",
      label: {
        id: "plugin.media.block.file.input.mime.label",
        message: "MIME type",
      },
    },
  ],
  text: [{ name: "filename", prose: false }],
  defaults: { media: null, href: "", filename: "", size: 0, mime: "" },
  view: () => import("./file.view.js"),
});
