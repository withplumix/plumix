// Single source of truth for the MIME types this plugin accepts and the
// extension we'll use for each in storage keys. Both `DEFAULT_ACCEPTED_TYPES`
// (the upload allowlist) and the rpc layer's extension picker derive from
// here, so the two stay in lockstep.
//
// SECURITY NOTE: the browser-claimed `Content-Type` is signed into the
// presigned PUT, but the bucket does not sniff bytes — a user can upload
// arbitrary content under any allowed mime. Serve uploads from a domain
// distinct from the admin (e.g. `media.example.com` vs `admin.example.com`)
// so a forged `text/html` or `image/svg+xml` cannot reach admin cookies.

export const MEDIA_MIME_REGISTRY: Readonly<Record<string, string>> = {
  // images
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
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

export const DEFAULT_ACCEPTED_TYPES: readonly string[] = Object.freeze(
  Object.keys(MEDIA_MIME_REGISTRY),
);

export function extensionForMime(mime: string): string | undefined {
  return MEDIA_MIME_REGISTRY[mime];
}
