import type { ReactElement } from "react";
import { useCallback } from "react";
import { Trans } from "@lingui/react";

import type { BlockRegistry } from "@plumix/blocks";

import { BlockInputControl } from "./block-input-control.js";
import { useEditorStore } from "./provider.js";
import { findBlock } from "./store.js";

interface BlockInspectorProps {
  /** Core + plugin block registry; supplies each block's input schema. */
  readonly registry: BlockRegistry;
}

/**
 * Right-rail panel for the active block's custom attributes. Reads the
 * selected block from the canonical tree, renders its registered inputs as
 * admin-ui controls, and patches the store on edit — which the canvas bridge
 * pushes to the iframe for a live, reload-free re-render.
 */
export function BlockInspector({
  registry,
}: BlockInspectorProps): ReactElement {
  const activeId = useEditorStore((s) => s.activeId);
  const tree = useEditorStore((s) => s.tree);
  const updateBlockAttrs = useEditorStore((s) => s.updateBlockAttrs);

  const block = activeId ? findBlock(tree, activeId) : undefined;
  const handleChange = useCallback(
    (key: string, value: unknown): void => {
      if (activeId) updateBlockAttrs(activeId, { [key]: value });
    },
    [activeId, updateBlockAttrs],
  );

  if (!block) {
    return (
      <div
        className="text-muted-foreground p-4 text-sm"
        data-testid="block-inspector-empty"
      >
        <Trans
          id="editor.inspector.empty"
          message="Select a block to edit its attributes."
        />
      </div>
    );
  }

  // Slot inputs hold child block arrays, not scalar attributes — editing
  // them as a control would overwrite the children with a string. Nested
  // editing is a separate concern (canvas selection of the child block).
  const inputs = (registry.get(block.name)?.inputs ?? []).filter(
    (input) => input.type !== "slot",
  );

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="block-inspector">
      {inputs.map((input) => (
        <BlockInputControl
          key={input.name}
          input={input}
          value={block.attrs?.[input.name]}
          onChange={(value) => handleChange(input.name, value)}
        />
      ))}
    </div>
  );
}
