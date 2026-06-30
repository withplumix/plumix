import type { ReactElement } from "react";

import { defineBlock } from "../block-registry.js";
import { EmbedFacade } from "./EmbedFacade.js";
import { resolveEmbed } from "./resolve.js";

export const embedBlock = defineBlock({
  name: "core/embed",
  title: "Embed",
  icon: "Code",
  category: "media",
  description:
    "Embed a YouTube, Vimeo, Loom, Spotify, or CodePen URL — or any other " +
    "page in a sandboxed iframe.",
  keywords: ["iframe", "video", "youtube", "vimeo", "media"],
  inputs: [
    { name: "url", type: "url", label: "URL" },
    { name: "title", type: "text", label: "Accessible title" },
    { name: "caption", type: "text", label: "Caption" },
  ],
  defaults: { url: "", title: "", caption: "" },
  render: ({ attrs }): ReactElement | null => {
    const url = typeof attrs.url === "string" ? attrs.url : "";
    const resolved = resolveEmbed(url);
    if (!resolved) return null;

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
