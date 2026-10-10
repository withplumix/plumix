import { _resetManifest } from "@/lib/manifest.js";

import type { PlumixManifest } from "@plumix/core/manifest";
import { MANIFEST_SCRIPT_ID } from "@plumix/core/manifest";

/** Drops the parsed snapshot so the next lookup re-reads the document. */
export function seedManifest(manifest: PlumixManifest): void {
  const existing = document.getElementById(MANIFEST_SCRIPT_ID);
  const script = existing ?? document.createElement("script");
  script.id = MANIFEST_SCRIPT_ID;
  script.setAttribute("type", "application/json");
  script.textContent = JSON.stringify(manifest);
  if (!existing) document.head.append(script);
  _resetManifest();
}

/** Undo `seedManifest`, restoring the empty-manifest default. */
export function clearManifest(): void {
  document.getElementById(MANIFEST_SCRIPT_ID)?.remove();
  _resetManifest();
}
