import type { MessageDescriptor } from "@lingui/core";
import type { ReactElement } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.js";
import { toastError, toastSuccess } from "@/lib/toast.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { ChevronDownIcon, EyeIcon, Link2Icon } from "lucide-react";

const M = {
  preview: defineMessage({
    id: "editor.preview.open",
    message: "Preview",
  }),
  previewTooltip: defineMessage({
    id: "editor.preview.tooltip",
    message: "Open a preview in a new tab",
  }),
  more: defineMessage({
    id: "editor.preview.more",
    message: "More preview options",
  }),
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

// Mints a shareable draft preview link (route injects `mintPreviewLink`, wired
// to entry.createPreviewLink — same DI shape as the revisions trigger, kept
// RPC-agnostic and unit-testable). Primary action opens that preview in a new
// tab; the menu keeps the copy-link affordance for sharing.
export function PreviewButton({
  mintPreviewLink,
}: {
  readonly mintPreviewLink: () => Promise<{ readonly url: string }>;
}): ReactElement {
  const renderLabel = useLabel();
  const [pending, setPending] = useState(false);

  function openPreview(): void {
    // Open the tab synchronously inside the click gesture so popup blockers
    // don't eat it, then navigate once the signed URL resolves. Null the
    // opener before navigating so the preview tab can't reach back into the
    // editor window.
    const win = window.open("", "_blank");
    setPending(true);
    mintPreviewLink()
      .then(({ url }) => {
        const href = new URL(url, window.location.origin).href;
        if (win) {
          win.opener = null;
          win.location.href = href;
        } else {
          window.open(href, "_blank", "noopener,noreferrer");
        }
      })
      .catch(() => {
        win?.close();
        toastError(renderLabel(M.failed));
      })
      .finally(() => {
        setPending(false);
      });
  }

  async function copyLink(): Promise<void> {
    setPending(true);
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
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            data-testid="editor-preview"
            onClick={openPreview}
            disabled={pending}
          >
            <EyeIcon className="size-4" aria-hidden />
            {renderLabel(M.preview)}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{renderLabel(M.previewTooltip)}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            data-testid="editor-preview-menu"
            disabled={pending}
            aria-label={renderLabel(M.more)}
          >
            <ChevronDownIcon className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            data-testid="editor-copy-preview-link"
            onClick={() => void copyLink()}
          >
            <Link2Icon className="size-4" aria-hidden />
            {renderLabel(M.copy)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
