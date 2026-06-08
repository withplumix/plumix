import type { MessageDescriptor } from "@lingui/core";
import type { ReactElement } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { toastError, toastSuccess } from "@/lib/toast.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Link2 } from "lucide-react";

const M = {
  copy: defineMessage({
    id: "editor.previewLink.copy",
    message: "Copy preview link",
  }),
  copied: defineMessage({
    id: "editor.previewLink.copied",
    message: "Preview link copied to clipboard",
  }),
  failed: defineMessage({
    id: "editor.previewLink.failed",
    message: "Couldn't create a preview link",
  }),
} satisfies Record<string, MessageDescriptor>;

// Safari only honors a clipboard write inside the originating user gesture,
// and the `await` on minting consumes that activation. Handing `ClipboardItem`
// a pending Blob registers the write synchronously within the gesture and lets
// the text resolve afterward. Engines without `ClipboardItem` fall back to the
// (gesture-sensitive) writeText.
async function copyText(textPromise: Promise<string>): Promise<void> {
  if (typeof ClipboardItem === "function") {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": textPromise.then(
          (text) => new Blob([text], { type: "text/plain" }),
        ),
      }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(await textPromise);
}

// Mints a shareable draft preview link and copies the absolute URL to the
// clipboard. The route injects `mintPreviewLink` (wired to
// entry.createPreviewLink) so this stays RPC-agnostic and unit-testable —
// same DI shape as the revisions trigger.
export function CopyPreviewLinkButton({
  mintPreviewLink,
}: {
  readonly mintPreviewLink: () => Promise<{ readonly url: string }>;
}): ReactElement {
  const renderLabel = useLabel();
  const [pending, setPending] = useState(false);

  async function onClick(): Promise<void> {
    setPending(true);
    // url is a site-relative path; resolve against the current origin.
    const hrefPromise = mintPreviewLink().then(
      ({ url }) => new URL(url, window.location.origin).href,
    );
    try {
      await copyText(hrefPromise);
      toastSuccess(renderLabel(M.copied));
    } catch {
      toastError(renderLabel(M.failed));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      data-testid="editor-copy-preview-link"
      onClick={() => void onClick()}
      disabled={pending}
      aria-label={renderLabel(M.copy)}
    >
      <Link2 className="size-4" aria-hidden />
    </Button>
  );
}
