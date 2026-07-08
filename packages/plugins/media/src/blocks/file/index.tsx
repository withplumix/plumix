import type { CSSProperties, ReactElement } from "react";
import { defineBlock } from "plumix/blocks";

import { formatSize, normalizeFileMedia, sanitizeHref } from "./normalize.js";

// Self-contained inline styles: the admin canvas iframe doesn't load the site
// stylesheet, so the file "chip" has to carry its own layout — otherwise the
// name + meta spans collapse into one run of text ("Download0 B").
const CHIP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  maxWidth: "100%",
  padding: "0.625rem 0.875rem",
  border: "1px solid #d0d7de",
  borderRadius: "6px",
  textDecoration: "none",
  color: "inherit",
};
const META: CSSProperties = { color: "#6a737d", fontSize: "0.875em" };
const PLACEHOLDER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  minHeight: "3rem",
  padding: "0.75rem 1rem",
  border: "1px dashed #d0d7de",
  borderRadius: "6px",
  background: "#f6f8fa",
  color: "#57606a",
  fontSize: "0.875rem",
};

export const fileBlock = defineBlock({
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
    // media picker writes. The fields below are manual escape hatches / overrides.
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
  defaults: { media: null, href: "", filename: "", size: 0, mime: "" },
  render: ({ attrs, context }): ReactElement | null => {
    // A picked asset's url wins over the raw href escape hatch.
    const media = normalizeFileMedia(attrs.media);
    const href = sanitizeHref(media?.url ?? attrs.href);
    if (!href) {
      // No file yet: render nothing on the public page (unfinished draft); in
      // the editor keep the block visible + selectable with a prompt.
      if (!context.editing) return null;
      return (
        <div data-plumix-file-placeholder="" style={PLACEHOLDER}>
          Pick or upload a file, or paste a download URL.
        </div>
      );
    }
    const picked =
      media?.filename ??
      (typeof attrs.filename === "string" ? attrs.filename : "");
    const filename = picked.length > 0 ? picked : "Download";
    const mime =
      media?.mime ?? (typeof attrs.mime === "string" ? attrs.mime : "");
    // `size` is manual-only — the picker's snapshot carries no byte size, so
    // unlike filename/mime it can't come from `media`.
    const meta = [formatSize(attrs.size), mime].filter(Boolean).join(" · ");
    return (
      <a href={href} download={filename} rel="noopener noreferrer" style={CHIP}>
        <span data-plumix-file-name="">{filename}</span>
        {meta.length > 0 ? (
          <span data-plumix-file-meta="" style={META}>
            {meta}
          </span>
        ) : null}
      </a>
    );
  },
});
