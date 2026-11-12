import { defineBlock } from "../block-registry.js";

export const embedBlock = defineBlock({
  name: "core/embed",
  title: { id: "block.core.embed.title", message: "Embed" },
  icon: "Code",
  category: "media",
  description: {
    id: "block.core.embed.description",
    message:
      "Embed a YouTube, Vimeo, Loom, Spotify, or CodePen URL — or any other " +
      "page in a sandboxed iframe.",
  },
  keywords: [
    { id: "block.core.embed.keyword.iframe", message: "iframe" },
    { id: "block.core.embed.keyword.video", message: "video" },
    { id: "block.core.embed.keyword.youtube", message: "youtube" },
    { id: "block.core.embed.keyword.vimeo", message: "vimeo" },
    { id: "block.core.embed.keyword.media", message: "media" },
  ],
  inputs: [
    {
      name: "url",
      type: "url",
      content: true,
      label: { id: "block.core.embed.input.url.label", message: "URL" },
    },
    {
      name: "title",
      type: "text",
      label: {
        id: "block.core.embed.input.title.label",
        message: "Accessible title",
      },
    },
    {
      name: "caption",
      type: "text",
      label: {
        id: "block.core.embed.input.caption.label",
        message: "Caption",
      },
    },
  ],
  text: [
    { name: "title", prose: false },
    { name: "caption", prose: false },
  ],
  defaults: { url: "", title: "", caption: "" },
  view: () => import("./embed.view.js"),
});
