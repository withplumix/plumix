/**
 * oEmbed safelist for `media/embed`. Each provider maps a recognised
 * share URL into the embeddable iframe URL the public site renders.
 *
 * Each provider exposes:
 *   - `name`: stable id used as `data-provider` and in the embed attr
 *   - `hosts`: hostnames the provider canonically serves on
 *   - `toEmbed(url)`: pure URL → iframe-URL; returns `undefined` for
 *     URLs that match the host but aren't embeddable (e.g. a YouTube
 *     channel page rather than a watch URL).
 *   - `allow`: minimal Permissions Policy directive list the embed
 *     genuinely needs. Avoids handing every provider the union of
 *     dangerous permissions — `clipboard-write`, for instance, only
 *     belongs on providers that pop a copy-link UI.
 *
 * Non-safelist URLs fall through to the strict-sandbox iframe path
 * in `EmbedComponent`. Adding a new provider here is the only step
 * required to support it — no schema change needed.
 */

interface OEmbedProvider {
  readonly name: string;
  readonly hosts: readonly string[];
  readonly allow: string;
  toEmbed(url: URL): string | undefined;
}

// Path-regex provider: match `url.pathname` against `pattern` and feed
// the capture groups into `build`. Each builder validates its capture
// against an id-pattern so a normalisation oddity (path traversal,
// arbitrary characters) can't leak into the constructed embed URL.
function pathRewrite(
  pattern: RegExp,
  build: (groups: readonly string[]) => string | undefined,
): (url: URL) => string | undefined {
  return (url) => {
    const match = pattern.exec(url.pathname);
    return match ? build(match.slice(1)) : undefined;
  };
}

// Common id shape — alphanumerics + `_` + `-`. Strict enough to block
// path-traversal (`../`) and URL-component characters that would let
// a hostile share URL rewrite the host or path of the embed iframe.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
function validId(raw: string | undefined): string | undefined {
  return raw && ID_PATTERN.test(raw) ? raw : undefined;
}

export const OEMBED_PROVIDERS: readonly OEmbedProvider[] = [
  {
    name: "youtube",
    hosts: ["youtube.com", "www.youtube.com", "youtu.be"],
    allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
    toEmbed(url) {
      if (url.hostname === "youtu.be") {
        const id = validId(url.pathname.replace(/^\//, "").split("/")[0]);
        return id ? `https://www.youtube.com/embed/${id}` : undefined;
      }
      if (url.pathname === "/watch") {
        const id = validId(url.searchParams.get("v") ?? undefined);
        return id ? `https://www.youtube.com/embed/${id}` : undefined;
      }
      const shorts = /^\/shorts\/([^/]+)/.exec(url.pathname);
      const id = validId(shorts?.[1]);
      return id ? `https://www.youtube.com/embed/${id}` : undefined;
    },
  },
  {
    name: "vimeo",
    hosts: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"],
    allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
    toEmbed(url) {
      // Already-embed URLs pass through. Exact-match on the hostname
      // rejects look-alikes like `player.vimeo.com.evil.example`.
      if (url.hostname === "player.vimeo.com") return url.toString();
      const raw = url.pathname.replace(/^\//, "").split("/")[0] ?? "";
      return /^\d{1,16}$/.test(raw)
        ? `https://player.vimeo.com/video/${raw}`
        : undefined;
    },
  },
  {
    name: "twitter",
    hosts: ["twitter.com", "www.twitter.com", "x.com", "www.x.com"],
    allow: "",
    // Twitter / X embed via publish.twitter.com — the canonical
    // share URL is the embed identifier.
    toEmbed: (url) =>
      /\/status\/\d{1,32}$/.test(url.pathname)
        ? `https://platform.twitter.com/embed/Tweet.html?url=${encodeURIComponent(url.toString())}`
        : undefined,
  },
  {
    name: "spotify",
    hosts: ["open.spotify.com"],
    allow: "encrypted-media",
    // /track/ID, /album/ID, /playlist/ID, /episode/ID, /show/ID
    toEmbed: pathRewrite(
      /^\/(track|album|playlist|episode|show)\/([^/]+)/,
      ([kind, raw]) => {
        const id = validId(raw);
        return id && kind
          ? `https://open.spotify.com/embed/${kind}/${id}`
          : undefined;
      },
    ),
  },
  {
    name: "codepen",
    hosts: ["codepen.io"],
    // CodePen runs untrusted user JS — keep it sandboxed by allowing
    // nothing beyond the iframe's own scripts.
    allow: "",
    toEmbed: pathRewrite(/^\/([^/]+)\/pen\/([^/]+)/, ([user, raw]) => {
      const userId = validId(user);
      const penId = validId(raw);
      return userId && penId
        ? `https://codepen.io/${userId}/embed/${penId}`
        : undefined;
    }),
  },
  {
    name: "loom",
    hosts: ["loom.com", "www.loom.com"],
    allow: "fullscreen; picture-in-picture",
    toEmbed: pathRewrite(/^\/share\/([^/]+)/, ([raw]) => {
      const id = validId(raw);
      return id ? `https://www.loom.com/embed/${id}` : undefined;
    }),
  },
];

/**
 * Resolve a share URL through the safelist. Returns the provider name,
 * the iframe URL, and the provider's Permissions-Policy `allow`
 * directive list when matched; `undefined` falls through to the
 * generic strict-sandbox iframe path.
 */
export function resolveOEmbed(raw: string):
  | {
      provider: string;
      embedUrl: string;
      allow: string;
    }
  | undefined {
  if (typeof raw !== "string") return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  const provider = OEMBED_PROVIDERS.find((p) =>
    p.hosts.includes(url.hostname.toLowerCase()),
  );
  if (!provider) return undefined;
  const embedUrl = provider.toEmbed(url);
  return embedUrl
    ? { provider: provider.name, embedUrl, allow: provider.allow }
    : undefined;
}
