/** Operator allowlist entry authorizing a remote host for optimization. */
export interface RemotePattern {
  readonly protocol?: string;
  readonly hostname: string;
  readonly port?: string;
  readonly pathname?: string;
}

/** Builds an optimized URL for `src` at a target width — the `imageDelivery` transform. */
export type ImageResolver = (
  src: string,
  opts?: {
    readonly width?: number;
    readonly quality?: number;
    readonly format?: string;
  },
) => string;

export interface BuildImageAttrsInput {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly sizes?: string;
  readonly densities?: readonly number[];
  readonly quality?: number;
  readonly format?: string;
  readonly resolver?: ImageResolver;
  readonly remotePatterns?: readonly RemotePattern[];
  readonly ladder?: readonly number[];
}

export interface ImageAttrs {
  readonly src: string;
  readonly srcSet?: string;
  readonly sizes?: string;
  readonly width: number;
  readonly height: number;
}

const DEFAULT_LADDER = [640, 768, 1024, 1280, 1536, 1920];

function isOptimizable(
  src: string,
  remotePatterns: readonly RemotePattern[],
): boolean {
  // SVG is vector — rasterizing it through an optimizer would degrade it.
  if (/^data:/i.test(src) || /\.svg($|[?#])/i.test(src)) return false;
  const remote = /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//");
  return remote ? matchesRemotePattern(src, remotePatterns) : true;
}

/**
 * Computes the `<img>` src/srcSet/sizes for a responsive, optimized image.
 * Unoptimizable sources (no resolver, unauthorized remote, SVG, data:) pass
 * through with just intrinsic dimensions — no srcSet. With `sizes`, emits a
 * width-descriptor srcSet from the breakpoint ladder (bounded at 2× the
 * intrinsic width); otherwise a density (1x/2x) srcSet.
 */
export function buildImageAttrs(input: BuildImageAttrsInput): ImageAttrs {
  const {
    src,
    width,
    height,
    sizes,
    densities,
    quality,
    format,
    resolver,
    remotePatterns = [],
    ladder = DEFAULT_LADDER,
  } = input;

  if (!resolver || !isOptimizable(src, remotePatterns)) {
    return { src, width, height };
  }
  const url = (w: number): string =>
    resolver(src, { width: w, quality, format });

  if (sizes !== undefined) {
    const max = width * 2;
    const widths = [
      ...new Set([...ladder.filter((w) => w <= max), width, max]),
    ].sort((a, b) => a - b);
    const srcSet = widths.map((w) => `${url(w)} ${w}w`).join(", ");
    return {
      src: url(widths[widths.length - 1] ?? width),
      srcSet,
      sizes,
      width,
      height,
    };
  }

  const seen = new Set<number>();
  const entries: string[] = [];
  for (const d of densities ?? [1, 2]) {
    const w = Math.round(width * d);
    if (seen.has(w)) continue;
    seen.add(w);
    entries.push(`${url(w)} ${d}x`);
  }
  return { src: url(width), srcSet: entries.join(", "), width, height };
}

function hostnameMatches(host: string, pattern: string): boolean {
  // `**.example.com` — one or more leading labels (not the bare apex).
  if (pattern.startsWith("**.")) {
    const suffix = pattern.slice(2);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  // `*.example.com` — exactly one leading label.
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    if (!host.endsWith(suffix)) return false;
    const label = host.slice(0, -suffix.length);
    return label.length > 0 && !label.includes(".");
  }
  return host === pattern;
}

function pathnameMatches(path: string, pattern: string | undefined): boolean {
  if (pattern === undefined) return true;
  // `/img/**` — that prefix at any depth.
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -2);
    return path.startsWith(prefix);
  }
  // `/img/*` — exactly one more segment.
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1);
    if (!path.startsWith(prefix)) return false;
    return !path.slice(prefix.length).includes("/");
  }
  return path === pattern;
}

/**
 * True when `rawUrl`'s host is authorized by one of `patterns`. Unparseable
 * URLs and an empty allowlist are denied — the optimizer must never be a
 * proxy for arbitrary remote URLs.
 */
export function matchesRemotePattern(
  rawUrl: string,
  patterns: readonly RemotePattern[],
): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  return patterns.some((p) => {
    if (p.protocol !== undefined && `${p.protocol}:` !== url.protocol)
      return false;
    if (p.port !== undefined && p.port !== url.port) return false;
    if (!hostnameMatches(url.hostname, p.hostname)) return false;
    return pathnameMatches(url.pathname, p.pathname);
  });
}
