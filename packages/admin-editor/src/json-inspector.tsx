import type { ReactElement } from "react";
import { lazy, Suspense, useState } from "react";
import { Trans } from "@lingui/react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@plumix/admin-ui/dialog";

import { findBlock } from "./block-tree-ops.js";
import { useEditorStore } from "./provider.js";

// Code-split: the highlighter only loads when the dialog first renders output.
const JsonHighlight = lazy(() => import("./json-highlight.js"));

type JsonScope = "page" | "block";

const OUTPUT_TESTID = "json-inspector-output";

/**
 * Read-only JSON view of the canonical tree, switchable between the selected
 * block and the whole page. A debugging/escape-hatch surface — it never
 * mutates the tree. Rendered inside {@link JsonSourceDialog}.
 */
export function JsonInspector(): ReactElement {
  const [scope, setScope] = useState<JsonScope>("page");
  const tree = useEditorStore((s) => s.tree);
  const activeId = useEditorStore((s) => s.activeId);

  const block =
    scope === "block" && activeId ? findBlock(tree, activeId) : null;
  const value = scope === "page" ? tree : block;

  return (
    <div className="flex min-h-0 flex-col gap-2" data-testid="json-inspector">
      <div className="flex gap-1" role="tablist">
        <ScopeButton
          scope="page"
          active={scope === "page"}
          onClick={() => setScope("page")}
        >
          <Trans id="editor.json.page" message="Page" />
        </ScopeButton>
        <ScopeButton
          scope="block"
          active={scope === "block"}
          onClick={() => setScope("block")}
        >
          <Trans id="editor.json.block" message="Block" />
        </ScopeButton>
      </div>
      {scope === "block" && !block ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid="json-inspector-empty"
        >
          <Trans id="editor.json.empty" message="Select a block to inspect." />
        </p>
      ) : (
        <JsonCode json={JSON.stringify(value, null, 2)} />
      )}
    </div>
  );
}

/** Highlighted JSON, degrading to plain text until the highlighter chunk loads
 *  (the fallback keeps the same testid so it's there the instant it renders). */
function JsonCode({ json }: { readonly json: string }): ReactElement {
  return (
    <Suspense
      fallback={
        <pre
          className="bg-muted max-h-[70vh] overflow-auto rounded p-3 text-xs leading-relaxed"
          data-testid={OUTPUT_TESTID}
        >
          {json}
        </pre>
      }
    >
      <JsonHighlight json={json} testId={OUTPUT_TESTID} />
    </Suspense>
  );
}

/** The source-code action's target: a large modal so the tree has room to
 *  breathe instead of being squashed into the right rail. */
export function JsonSourceDialog(): ReactElement {
  const open = useEditorStore((s) => s.jsonOpen);
  const setJsonOpen = useEditorStore((s) => s.setJsonOpen);
  return (
    <Dialog open={open} onOpenChange={setJsonOpen}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-3 sm:max-w-3xl"
        data-testid="json-source-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            <Trans id="editor.json.title" message="Source" />
          </DialogTitle>
        </DialogHeader>
        <JsonInspector />
      </DialogContent>
    </Dialog>
  );
}

function ScopeButton({
  scope,
  active,
  onClick,
  children,
}: {
  readonly scope: JsonScope;
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={`json-inspector-toggle-${scope}`}
      onClick={onClick}
      className="hover:bg-accent aria-selected:bg-accent rounded px-2 py-1 text-sm"
    >
      {children}
    </button>
  );
}
