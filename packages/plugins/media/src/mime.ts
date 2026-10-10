// Bytes are stored verbatim and SVG or `text/*` can carry script, so serve
// uploads from a domain distinct from the admin. SVG is opt-in for that reason.

const MEDIA_MIME_REGISTRY: Readonly<Record<string, string>> = {
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
