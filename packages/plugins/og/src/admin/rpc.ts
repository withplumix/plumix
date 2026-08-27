import type { CardPreview } from "../preview.js";

// The subdirectory mount the host exposes, so a site served under a path
// builds the same URL its worker answers on.
function basePath(): string {
  return (
    (globalThis as { plumix?: { basePath?: string } }).plumix?.basePath ?? ""
  );
}

/**
 * Ask the plugin's own procedure what this entry will be shared with.
 *
 * Hand-rolled rather than typed through the admin's client: `AppRouterClient`
 * covers core's procedures only, so a plugin speaks the StandardRPC envelope
 * (`{ json, meta: [] }`) directly — the same shape `@plumix/plugin-media` uses.
 */
export async function fetchCardPreview(entryId: number): Promise<CardPreview> {
  const response = await fetch(`${basePath()}/_plumix/rpc/og/preview`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-plumix-request": "1",
    },
    body: JSON.stringify({ json: { entryId }, meta: [] }),
  });
  const envelope = (await response.json().catch(() => null)) as {
    json?: unknown;
  } | null;
  if (!response.ok) {
    const error = envelope?.json as { message?: string } | undefined;
    // eslint-disable-next-line no-restricted-syntax -- rpc envelope rethrow; the server-derived message is the discriminator
    throw new Error(error?.message ?? `og_preview_${String(response.status)}`);
  }
  return envelope?.json as CardPreview;
}
