interface ResolvedEmbed {
  readonly provider: string;
  readonly src: string;
  // Safelisted providers render with provider-appropriate `allow`
  // permissions; everything else is framed under a strict sandbox.
  readonly sandboxed: boolean;
  // Responsive aspect-ratio container (e.g. "16 / 9") for video; mutually
  // exclusive with `height`, which fixed-height audio/code embeds use.
  readonly aspect?: string;
  readonly height?: number;
  readonly allowFullscreen?: boolean;
}

interface Provider {
  readonly id: string;
  // Hostname already stripped of a leading `www.`.
  readonly host: (host: string) => boolean;
  // Returns the embed `src`, or null when the path doesn't name a resource.
  readonly toSrc: (url: URL) => string | null;
  readonly aspect?: string;
  readonly height?: number;
  readonly allowFullscreen?: boolean;
}

function firstSegment(url: URL): string | undefined {
  return url.pathname.split("/").find(Boolean);
}

// Provider ids/handles only ever contain url-safe word chars and
// hyphens. Validating before interpolation keeps a crafted path
// (traversal, extra segments) from producing a malformed embed `src`
// instead of relying on the iframe origin staying fixed as the backstop.
const SAFE_SEGMENT = /^[\w-]+$/;
const YOUTUBE_ID = /^[\w-]{11}$/;

const PROVIDERS: readonly Provider[] = [
  {
    id: "youtube",
    host: (h) => h === "youtube.com" || h === "youtu.be",
    toSrc: (url) => {
      const host = url.hostname.replace(/^www\./, "");
      const id =
        host === "youtu.be"
          ? firstSegment(url)
          : (url.searchParams.get("v") ??
            (url.pathname.startsWith("/shorts/")
              ? url.pathname.split("/").filter(Boolean)[1]
              : undefined));
      return id && YOUTUBE_ID.test(id)
        ? `https://www.youtube-nocookie.com/embed/${id}`
        : null;
    },
    aspect: "16 / 9",
    allowFullscreen: true,
  },
  {
    id: "vimeo",
    host: (h) => h === "vimeo.com",
    toSrc: (url) => {
      const id = firstSegment(url);
      return id && /^\d+$/.test(id)
        ? `https://player.vimeo.com/video/${id}`
        : null;
    },
    aspect: "16 / 9",
    allowFullscreen: true,
  },
  {
    id: "loom",
    host: (h) => h === "loom.com",
    toSrc: (url) => {
      const segments = url.pathname.split("/").filter(Boolean);
      const id = segments[0] === "share" ? segments[1] : undefined;
      return id && SAFE_SEGMENT.test(id)
        ? `https://www.loom.com/embed/${id}`
        : null;
    },
    aspect: "16 / 9",
    allowFullscreen: true,
  },
  {
    id: "spotify",
    host: (h) => h === "open.spotify.com",
    toSrc: (url) => {
      const segments = url.pathname.split("/").filter(Boolean);
      const [type, id] = segments;
      const TYPES = new Set([
        "track",
        "album",
        "playlist",
        "episode",
        "show",
        "artist",
      ]);
      return type && id && TYPES.has(type) && SAFE_SEGMENT.test(id)
        ? `https://open.spotify.com/embed/${type}/${id}`
        : null;
    },
    height: 352,
  },
  {
    id: "codepen",
    host: (h) => h === "codepen.io",
    toSrc: (url) => {
      const segments = url.pathname.split("/").filter(Boolean);
      const [user, kind, id] = segments;
      return user &&
        kind === "pen" &&
        id &&
        SAFE_SEGMENT.test(user) &&
        SAFE_SEGMENT.test(id)
        ? `https://codepen.io/${user}/embed/${id}`
        : null;
    },
    height: 400,
  },
];

export function resolveEmbed(rawUrl: string): ResolvedEmbed | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  // Only ever frame http(s) — keeps `javascript:`, `data:`, and other
  // schemes out of the iframe `src`.
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");

  for (const provider of PROVIDERS) {
    if (!provider.host(host)) continue;
    const src = provider.toSrc(url);
    if (!src) continue;
    return {
      provider: provider.id,
      src,
      sandboxed: false,
      ...(provider.aspect && { aspect: provider.aspect }),
      ...(provider.height && { height: provider.height }),
      ...(provider.allowFullscreen && { allowFullscreen: true }),
    };
  }

  return {
    provider: "generic",
    src: url.toString(),
    sandboxed: true,
    aspect: "16 / 9",
  };
}
