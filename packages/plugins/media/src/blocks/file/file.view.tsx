import type { BlockViewProps } from "plumix/blocks";
import type { CSSProperties, ReactElement } from "react";
import { sanitizeHref } from "plumix/blocks";

import { formatSize, normalizeFileMedia } from "./normalize.js";

/**
 * Inline styles: the admin canvas iframe doesn't load the site stylesheet, so
 * without them the name and meta spans run together ("Download0 B").
 */
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

const PLACEHOLDER_PROMPT = {
  id: "plugin.media.block.file.placeholder",
  message: "Pick or upload a file, or paste a download URL.",
};
const DOWNLOAD_FALLBACK = {
  id: "plugin.media.block.file.downloadFallback",
  message: "Download",
};

function pickNonEmpty(picked: string | undefined, manual: unknown): string {
  if (picked !== undefined && picked !== "") return picked;
  return typeof manual === "string" ? manual : "";
}

export default function FileView({
  attrs,
  context,
}: BlockViewProps): ReactElement | null {
  // A picked asset's url wins over the raw href escape hatch.
  const media = normalizeFileMedia(attrs.media);
  const href = sanitizeHref(media?.url ?? attrs.href);
  if (!href) {
    // No file yet: render nothing on the public page (unfinished draft); in
    // the editor keep the block visible + selectable with a prompt.
    if (!context.editing) return null;
    return (
      <div data-plumix-file-placeholder="" style={PLACEHOLDER}>
        {context.t(PLACEHOLDER_PROMPT)}
      </div>
    );
  }
  // The snapshot projects an absent filename/mime to "", so `??` would never
  // reach the manual field — an empty picked value has to fall through.
  const picked = pickNonEmpty(media?.filename, attrs.filename);
  const filename = picked.length > 0 ? picked : context.t(DOWNLOAD_FALLBACK);
  const mime = pickNonEmpty(media?.mime, attrs.mime);
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
}
