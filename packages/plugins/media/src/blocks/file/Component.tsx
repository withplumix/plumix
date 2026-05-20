import type { BlockProps } from "plumix/blocks";
import type { ReactElement } from "react";

import { formatSize, sanitizeHref } from "./normalize.js";

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
