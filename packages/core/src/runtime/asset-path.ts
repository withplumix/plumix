/** Content types for what a Vite client build emits and a site's `public/` may add. */
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

// Dotfiles are refused throughout the tree, `.well-known` aside: an `.env`
// dropped into `public/` must never become a URL. That takes `.` and `..`
// with it, so no segment can climb; a backslash is refused because Windows
// reads it as a separator the `/` split never saw.
function refused(segment: string): boolean {
  return (
    (segment.startsWith(".") && segment !== ".well-known") ||
    segment.includes("\\")
  );
}

/**
 * The file a URL path names under a static root, with the headers it is
 * served with, or `null` when a self-hosted runtime's assets layer does not
 * hold it. A directory is held only through its trailing-slash form, which
 * names its `index.html` — the shape the admin shell is fetched by. The rule
 * does no I/O: the runtime opens the file, and a path naming a directory
 * without the slash is refused there, when the file is found not to be one.
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
