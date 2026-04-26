// Single source of truth for the MIME types this plugin accepts and the
// extension we'll use for each in storage keys. Both `DEFAULT_ACCEPTED_TYPES`
// (the upload allowlist) and the rpc layer's extension picker derive from
// here, so the two stay in lockstep.
//
// SECURITY:
// - The bucket stores whatever bytes the client uploads; the worker
//   verifies them against the claimed mime via magic-byte sniff in
//   `media.confirm` (defense-in-depth — we don't trust the signed
//   Content-Type header at upload time).
// - `image/svg+xml` is intentionally NOT in the default allowlist:
//   SVG is XML and can carry executable `<script>`/`onload=` payloads.
//   A magic-byte sniff can confirm the bytes start with `<svg`/`<?xml`
//   but cannot prove they're safe to render. Operators who need SVG
//   uploads must opt in explicitly via `media({ acceptedTypes: [...] })`
//   AND serve from a separate cookie domain (so any embedded script
//   can't reach admin cookies).
// - Same precaution applies to `text/*` mimes: bytes are stored verbatim,
//   and a malicious actor could disguise HTML/JS as `text/plain`. Always
//   serve uploads from a domain distinct from the admin.

export const MEDIA_MIME_REGISTRY: Readonly<Record<string, string>> = {
  // images
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  // SVG kept in the registry so opt-in consumers get the right extension,
  // but excluded from DEFAULT_ACCEPTED_TYPES below.
  "image/svg+xml": "svg",
  // documents
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  // audio
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  // video
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  // archives
  "application/zip": "zip",
};

const SVG_MIME = "image/svg+xml";

export const DEFAULT_ACCEPTED_TYPES: readonly string[] = Object.freeze(
  Object.keys(MEDIA_MIME_REGISTRY).filter((m) => m !== SVG_MIME),
);

export function extensionForMime(mime: string): string | undefined {
  return MEDIA_MIME_REGISTRY[mime];
}
