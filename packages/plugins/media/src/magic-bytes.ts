// R2 stores the claimed `Content-Type` without sniffing bytes, so an upload
// claiming `image/png` could be HTML. A MIME with no matcher passes.

type Matcher = (bytes: Uint8Array) => boolean;

const sigAt =
  (offset: number, ...sig: readonly number[]): Matcher =>
  (b) => {
    if (b.length < offset + sig.length) return false;
    for (let i = 0; i < sig.length; i++) {
      if (b[offset + i] !== sig[i]) return false;
    }
    return true;
  };

const startsWith = (...sig: readonly number[]): Matcher => sigAt(0, ...sig);

const anyOf =
  (...m: readonly Matcher[]): Matcher =>
  (b) =>
    m.some((f) => f(b));

/**
 * `RIFF...<tag>` containers — `tag` lives at offset 8 after `RIFF` + size.
 * Used by image/webp + audio/wav.
 */
const riffWith = (...tag: readonly number[]): Matcher => {
  const head = startsWith(0x52, 0x49, 0x46, 0x46); // RIFF
  const tail = sigAt(8, ...tag);
  return (b) => head(b) && tail(b);
};

const isXmlOrSvg: Matcher = (b) => {
  // SVG/XML: tolerate UTF-8 BOM + leading whitespace, then `<?xml` or `<svg`.
  const text = new TextDecoder("utf-8", { fatal: false }).decode(
    b.subarray(0, Math.min(b.length, 256)),
  );
  // Strip a leading UTF-8 BOM (U+FEFF) before checking the prefix.
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  return trimmed.startsWith("<?xml") || trimmed.startsWith("<svg");
};

/**
 * HTML stashed in `.txt` bypasses the image allowlist. Plain text can't be
 * proven, so reject obvious markup and require valid UTF-8.
 */
const isPlainText: Matcher = (b) => {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      b.subarray(0, Math.min(b.length, 256)),
    );
  } catch {
    return false;
  }
  const trimmed = text
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  return !(
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<?xml") ||
    trimmed.startsWith("<svg") ||
    trimmed.startsWith("<script") ||
    trimmed.startsWith("<iframe")
  );
};

/**
 * `ftyp` at offset 4 covers MP4, MOV, AVIF, HEIC, etc. We only need to
 * detect "is this an isobmff container", not which brand exactly.
 */
const isISOBMFF: Matcher = sigAt(4, 0x66, 0x74, 0x79, 0x70);

/**
 * Any zip passes for every Office/ODF subtype; harmless because none is
 * inline-safe, so the serve route force-downloads them all.
 */
const isZipContainer: Matcher = startsWith(0x50, 0x4b, 0x03, 0x04);

/** OLE2 compound document — legacy Office (.doc/.xls/.ppt). */
const isOle2: Matcher = startsWith(0xd0, 0xcf, 0x11, 0xe0);

const MATCHERS: Readonly<Record<string, Matcher>> = {
  "image/jpeg": startsWith(0xff, 0xd8, 0xff),
  "image/png": startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  "image/gif": anyOf(
    startsWith(0x47, 0x49, 0x46, 0x38, 0x37, 0x61), // GIF87a
    startsWith(0x47, 0x49, 0x46, 0x38, 0x39, 0x61), // GIF89a
  ),
  "image/webp": riffWith(0x57, 0x45, 0x42, 0x50), // RIFF…WEBP
  "image/avif": isISOBMFF,
  "image/svg+xml": isXmlOrSvg,
  "application/pdf": startsWith(0x25, 0x50, 0x44, 0x46), // %PDF
  "application/zip": isZipContainer,
  "application/msword": isOle2,
  "application/vnd.ms-excel": isOle2,
  "application/vnd.ms-powerpoint": isOle2,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    isZipContainer,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    isZipContainer,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    isZipContainer,
  "audio/mpeg": anyOf(
    startsWith(0x49, 0x44, 0x33), // ID3v2 tag
    startsWith(0xff, 0xfb),
    startsWith(0xff, 0xf3),
    startsWith(0xff, 0xf2),
  ),
  "audio/wav": riffWith(0x57, 0x41, 0x56, 0x45), // RIFF…WAVE
  "audio/ogg": startsWith(0x4f, 0x67, 0x67, 0x53), // OggS
  "video/mp4": isISOBMFF,
  "video/webm": startsWith(0x1a, 0x45, 0xdf, 0xa3), // EBML
  "video/quicktime": isISOBMFF,
  "text/plain": isPlainText,
  "text/markdown": isPlainText,
  "text/csv": isPlainText,
};

/** Buffer size we ask storage to read for the magic-byte sniff. */
export const MAGIC_BYTE_SAMPLE_SIZE = 64;

export function looksLikeMime(bytes: Uint8Array, claimedMime: string): boolean {
  const matcher = MATCHERS[claimedMime];
  if (!matcher) return true; // unknown / text — can't verify; accept.
  return matcher(bytes);
}
