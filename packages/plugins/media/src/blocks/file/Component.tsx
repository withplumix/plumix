import type { BlockProps } from "plumix/blocks";
import type { ReactElement } from "react";

// Accepts http(s), root-relative, parent-relative, mailto:, and tel:.
// File blocks legitimately link to contact addresses for "email me
// the pdf" flows. Other schemes (javascript:, data:, vbscript:) are
// silently stripped so a hostile href never reaches the rendered `<a>`.
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|\.\.?\/)/i;

function sanitizeHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed === "" || !SAFE_HREF.test(trimmed)) return undefined;
  return trimmed;
}

function formatSize(bytes: unknown): string | undefined {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return undefined;
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size.toFixed(size >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function FileComponent({ attrs }: BlockProps): ReactElement {
  const href = sanitizeHref(attrs.href);
  const filename =
    typeof attrs.filename === "string" && attrs.filename.length > 0
      ? attrs.filename
      : "Download";
  const sizeLabel = formatSize(attrs.size);
  const mime = typeof attrs.mime === "string" ? attrs.mime : "";
  return (
    <a
      data-plumix-block="media/file"
      href={href}
      download={filename}
      rel="noopener noreferrer"
    >
      <span data-plumix-file-name="">{filename}</span>
      {sizeLabel || mime.length > 0 ? (
        <span data-plumix-file-meta="">
          {[sizeLabel, mime].filter(Boolean).join(" · ")}
        </span>
      ) : null}
    </a>
  );
}
