import type { Editor } from "@tiptap/react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import type {
  BlockRegistry,
  BlockStyleSlot,
  ResolvedBlockSpec,
} from "@plumix/blocks";

import { InspectorField } from "./InspectorField.js";
import { SupportsSection } from "./SupportsSection.js";

interface InspectorProps {
  readonly editor: Editor;
  readonly blockRegistry: BlockRegistry;
}

interface SelectedNode {
  readonly spec: ResolvedBlockSpec;
  readonly attrs: Readonly<Record<string, unknown>>;
}

/**
 * Block Inspector — subscribes to the editor's selection and, when the
 * caret is inside a registered block with declared `attributes`,
 * renders one `InspectorField` per attribute. Field changes flow
 * through `editor.chain().focus().updateAttributes(nodeName, ...)`
 * so the editor's own undo / collaboration / history pipeline owns
 * the mutation.
 *
 * Renders nothing when no spec is found OR the spec declares no
 * attributes — keeps the rail clean when the user is editing plain
 * paragraphs.
 */
export function Inspector({
  editor,
  blockRegistry,
}: InspectorProps): ReactElement | null {
  const [selected, setSelected] = useState<SelectedNode | null>(() =>
    resolveSelection(editor, blockRegistry),
  );

  useEffect(() => {
    // `transaction` covers selection moves AND attribute updates;
    // `selectionUpdate` alone would miss `updateAttributes` mutations
    // that don't move the caret.
    //
    // The handler fires on every keystroke inside the editor, so we
    // bail out when neither the spec identity nor the attrs object
    // changed. Without this check, every keystroke produces a new
    // `{ spec, attrs }` object → React re-renders the Inspector even
    // when there's nothing to redraw.
    const sync = (): void => {
      setSelected((prev) => {
        const next = resolveSelection(editor, blockRegistry);
        if (!prev && !next) return prev;
        if (prev?.spec === next?.spec && prev?.attrs === next?.attrs) {
          return prev;
        }
        return next;
      });
    };
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor, blockRegistry]);

  if (!selected) return null;
  const { spec, attrs } = selected;
  const attributeEntries = spec.attributes
    ? Object.entries(spec.attributes)
    : [];
  const hasSupports = Boolean(spec.supports);
  if (attributeEntries.length === 0 && !hasSupports) return null;

  const slot = (attrs.style ?? {}) as BlockStyleSlot;

  return (
    <div data-plumix-inspector="" aria-label={`${spec.title} attributes`}>
      <h3 data-plumix-inspector-title="">{spec.title}</h3>
      {attributeEntries.map(([attrName, schema]) => (
        <InspectorField
          key={attrName}
          name={attrName}
          schema={schema}
          value={attrName in attrs ? attrs[attrName] : schema.default}
          onChange={(next) => {
            editor
              .chain()
              .focus()
              .updateAttributes(spec.name, { [attrName]: next })
              .run();
          }}
        />
      ))}
      {spec.supports ? (
        <SupportsSection
          supports={spec.supports}
          style={slot}
          onChange={(nextSlot) => {
            editor
              .chain()
              .focus()
              .updateAttributes(spec.name, { style: nextSlot })
              .run();
          }}
        />
      ) : null}
    </div>
  );
}

function resolveSelection(
  editor: Editor,
  blockRegistry: BlockRegistry,
): SelectedNode | null {
  const node = editor.state.selection.$from.parent;
  const spec = blockRegistry.get(node.type.name);
  if (!spec) return null;
  return {
    spec,
    attrs: node.attrs,
  };
}
