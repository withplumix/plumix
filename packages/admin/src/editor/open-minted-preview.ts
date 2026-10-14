/** The part of a `window.open` result a preview tab is driven through. */
interface PreviewTab {
  opener: unknown;
  readonly location: { href: string };
  readonly close: () => void;
}

interface OpenMintedPreviewInput {
  readonly open: (
    url: string,
    target: string,
    features?: string,
  ) => PreviewTab | null;
  /** Resolves a relative minted URL. */
  readonly origin: string;
  readonly mint: () => Promise<{ readonly url: string }>;
}

/**
 * The tab opens before the mint so popup blockers allow it; its opener is
 * nulled so it can't reach back into the editor.
 */
export async function openMintedPreview({
  open,
  origin,
  mint,
}: OpenMintedPreviewInput): Promise<void> {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- window.open target, not UI copy
  const tab = open("", "_blank");
  try {
    const { url } = await mint();
    const href = new URL(url, origin).href;
    if (tab) {
      tab.opener = null;
      tab.location.href = href;
    } else {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- window.open target and features, not UI copy
      open(href, "_blank", "noopener,noreferrer");
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}
