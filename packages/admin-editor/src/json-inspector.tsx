import type { ReactElement } from "react";
import { useState } from "react";
import { Trans } from "@lingui/react";

import { findBlock } from "./block-tree-ops.js";
import { useEditorStore } from "./provider.js";

type JsonScope = "page" | "block";

/**
 * Read-only JSON view of the canonical tree, switchable between the selected
 * block and the whole page. A debugging/escape-hatch surface — it never
 * mutates the tree.
 */
export function JsonInspector(): ReactElement {
  const [scope, setScope] = useState<JsonScope>("page");
  const tree = useEditorStore((s) => s.tree);
  const activeId = useEditorStore((s) => s.activeId);

  const block =
    scope === "block" && activeId ? findBlock(tree, activeId) : null;
  const value = scope === "page" ? tree : block;

  return (
    <div className="flex flex-col gap-2 p-3" data-testid="json-inspector">
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
        <pre
          className="bg-muted overflow-auto rounded p-2 text-xs"
          data-testid="json-inspector-output"
        >
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
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
