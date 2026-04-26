interface MediaMeta {
  readonly mime: string;
  readonly size: number;
  readonly storageKey: string;
  readonly originalName: string | null;
  readonly alt: string | null;
}

export function parseMediaMeta(raw: unknown): MediaMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.storageKey !== "string" ||
    typeof r.mime !== "string" ||
    typeof r.size !== "number"
  ) {
    return null;
  }
  return {
    storageKey: r.storageKey,
    mime: r.mime,
    size: r.size,
    originalName: typeof r.originalName === "string" ? r.originalName : null,
    alt: typeof r.alt === "string" ? r.alt : null,
  };
}
