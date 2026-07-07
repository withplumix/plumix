// http(s), root-relative, parent-relative, mailto:, and tel: pass; the
// last two are required for contact-card "email me the file" flows.
// Everything else is silently dropped so a hostile attribute value
// never reaches the rendered anchor.
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|\.\.?\/)/i;

export function sanitizeHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed === "" || !SAFE_HREF.test(trimmed)) return undefined;
  return trimmed;
}

// The picker writes a { id, url, filename?, mime? } snapshot. Read what the
// file render needs, tolerating a null/legacy value.
interface FileMedia {
  readonly url: string;
  readonly filename: string;
  readonly mime: string;
}
export function normalizeFileMedia(raw: unknown): FileMedia | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.url !== "string" || obj.url === "") return null;
  return {
    url: obj.url,
    filename: typeof obj.filename === "string" ? obj.filename : "",
    mime: typeof obj.mime === "string" ? obj.mime : "",
  };
}

export function formatSize(bytes: unknown): string | undefined {
  // Public-site SSR render. Decimal separator stays `.` until content
  // i18n lands — the visitor-facing locale resolver is the seam where
  // this should pull from. Admin-side formatting (MediaLibrary card +
  // detail) uses `Intl.NumberFormat(locale, ...)` against `i18n.locale`.
  // `<= 0` (not `< 0`): 0 is the unset default, so it reads as "no size"
  // rather than a literal "0 B".
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return undefined;
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size.toFixed(size >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
