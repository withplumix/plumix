const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};

const IMMUTABLE = "public, max-age=31536000, immutable";

export interface AssetPath {
  /** The file under the root, which the runtime still has to find is one. */
  readonly file: string;
  readonly headers: {
    readonly "content-type": string;
    readonly "cache-control"?: string;
  };
}

function contentType(name: string): string {
  const dot = name.lastIndexOf(".");
  const extension = dot <= 0 ? "" : name.slice(dot).toLowerCase();
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

// An `.env` in `public/` must never become a URL; this also blocks `..`.
// Windows reads a backslash as a separator.
function refused(segment: string): boolean {
  return (
    (segment.startsWith(".") && segment !== ".well-known") ||
    segment.includes("\\")
  );
}

/**
 * Does no I/O. A directory resolves only with a trailing slash, to its
 * `index.html`; the runtime must refuse a slashless directory.
 */
export function resolveAssetPath(
  root: string,
  pathname: string,
): AssetPath | null {
  const fragment = pathname.indexOf("#");
  let decoded: string;
  try {
    decoded = decodeURI(
      fragment === -1 ? pathname : pathname.slice(0, fragment),
    );
  } catch {
    return null;
  }
  if (!decoded.startsWith("/")) return null;
  const relative = decoded.endsWith("/") ? `${decoded}index.html` : decoded;
  const segments = relative.split("/");
  if (segments.some(refused)) return null;
  return {
    file: `${root.replace(/[/\\]$/, "")}${relative}`,
    headers: {
      "content-type": contentType(segments.at(-1) ?? ""),
      // Hashed build output lives under `/assets/`; nothing else is content
      // addressed, so nothing else may be cached forever.
      ...(relative.startsWith("/assets/")
        ? { "cache-control": IMMUTABLE }
        : {}),
    },
  };
}
