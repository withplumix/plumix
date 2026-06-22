import type { ReactElement } from "react";
import { defineBlock } from "plumix/blocks";

import { formatSize, sanitizeHref } from "./normalize.js";

export const fileBlock = defineBlock({
  name: "media/file",
  title: "File",
  icon: "File",
  category: "media",
  description: "Downloadable file with size + MIME label.",
  keywords: ["download", "attachment"],
  inputs: [
    { name: "mediaId", type: "text", label: "Media id" },
    { name: "href", type: "url", label: "Download URL" },
    { name: "filename", type: "text", label: "Filename" },
    { name: "size", type: "number", label: "Size (bytes)" },
    { name: "mime", type: "text", label: "MIME type" },
    { name: "thumbnail", type: "url", label: "Preview thumbnail URL" },
  ],
  defaults: {
    mediaId: "",
    href: "",
    filename: "",
    size: 0,
    mime: "",
    thumbnail: "",
  },
  render: ({ attrs }): ReactElement => {
    const href = sanitizeHref(attrs.href);
    const filename =
      typeof attrs.filename === "string" && attrs.filename.length > 0
        ? attrs.filename
        : "Download";
    const sizeLabel = formatSize(attrs.size);
    const mime = typeof attrs.mime === "string" ? attrs.mime : "";
    const meta = [sizeLabel, mime].filter(Boolean).join(" · ");
    return (
      <a href={href} download={filename} rel="noopener noreferrer">
        <span data-plumix-file-name="">{filename}</span>
        {meta.length > 0 ? <span data-plumix-file-meta="">{meta}</span> : null}
      </a>
    );
  },
});
