import type { Data } from "@puckeditor/core";

export function readDraft(key: string): Data | undefined {
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPuckData(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeDraft(key: string, data: Data): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error("[plumix:local-draft] Failed to persist draft:", error);
  }
}

function isPuckData(value: unknown): value is Data {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { content?: unknown; root?: unknown };
  return (
    Array.isArray(candidate.content) &&
    typeof candidate.root === "object" &&
    candidate.root !== null
  );
}
