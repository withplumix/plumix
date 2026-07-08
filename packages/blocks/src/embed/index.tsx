import type { ReactElement } from "react";

import { defineBlock } from "../block-registry.js";
import { EmbedFacade } from "./EmbedFacade.js";
import { resolveEmbed } from "./resolve.js";

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
  defaults: { url: "", title: "", caption: "" },
  render: ({ attrs, context }): ReactElement | null => {
    const url = typeof attrs.url === "string" ? attrs.url : "";
    const resolved = resolveEmbed(url);
    if (!resolved) {
      // No usable URL yet: render nothing on the public page (an empty embed is
      // an unfinished draft), but in the editor show a placeholder so the block
      // stays visible and selectable instead of collapsing to a zero-height line.
      if (!context.editing) return null;
      return (
        <div
          data-plumix-embed-placeholder=""
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "8rem",
            padding: "1rem",
            border: "1px dashed #d0d7de",
            borderRadius: "6px",
            background: "#f6f8fa",
            color: "#57606a",
            fontSize: "0.875rem",
            textAlign: "center",
          }}
        >
          Add a YouTube, Vimeo, Loom, Spotify, or CodePen URL to embed.
        </div>
      );
    }

    const title =
      typeof attrs.title === "string" && attrs.title.length > 0
        ? attrs.title
        : "Embedded content";
    const caption = typeof attrs.caption === "string" ? attrs.caption : "";

    // The iframe (with its sandbox/referrer protections) is never rendered
    // server-side — the facade mounts it client-side on the visitor's first
    // click, so an author-chosen host gets no connection until opt-in. The
    // sandbox decision still travels with `sandboxed` for that mount.
    return (
      <EmbedFacade
        client="interaction"
        prefetch="visible"
        src={resolved.src}
        title={title}
        caption={caption}
        provider={resolved.provider}
        sandboxed={resolved.sandboxed}
        {...(resolved.aspect && { aspect: resolved.aspect })}
        {...(resolved.height && { height: resolved.height })}
        {...(resolved.allowFullscreen && { allowFullscreen: true })}
      />
    );
  },
});
