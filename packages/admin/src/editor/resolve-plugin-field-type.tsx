import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { getPluginFieldType } from "@/lib/plugin-registry.js";

import type { PluginFieldControl } from "@plumix/admin-editor";
import type { BlockInput } from "@plumix/blocks";
import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

type PluginFieldComponent = NonNullable<ReturnType<typeof getPluginFieldType>>;

// Adapt a block input onto the metabox field-manifest shape plugin field
// renderers already expect, so one `registerPluginFieldType` registration
// serves both the metabox form and the block inspector. Only the fields the
// reference pickers read are projected — the reference `scope` (accept) and
// the object value shape.
function inputToField(input: BlockInput): MetaBoxFieldManifestEntry {
  return {
    key: input.name,
    label: input.label ?? input.name,
    type: "json",
    inputType: input.type,
    referenceTarget: {
      kind: input.type,
      scope: input.accept === undefined ? undefined : { accept: input.accept },
      // eslint-disable-next-line lingui/no-unlocalized-strings -- value shape, not UI copy
      valueShape: "object",
    },
  };
}

// One stable wrapper per registered component. Resolving on every inspector
// render must return the same identity, or the picker (and its open modal)
// would remount and lose state each keystroke elsewhere in the panel.
const wrappers = new WeakMap<PluginFieldComponent, PluginFieldControl>();

/**
 * Resolve a block-input type the editor's built-in controls don't handle to a
 * host control, wired to the admin's plugin field-type registry. Passed into
 * `PlumixEditor`; the editor package stays decoupled from the registry.
 */
export function resolvePluginFieldType(
  type: string,
): PluginFieldControl | undefined {
  const Component = getPluginFieldType(type);
  if (!Component) return undefined;
  const cached = wrappers.get(Component);
  if (cached) return cached;
  const wrapper: PluginFieldControl = ({ field, rhf, disabled, testId }) => (
    <Component
      field={inputToField(field as BlockInput)}
      rhf={rhf as unknown as ControllerRenderProps<FieldValues, string>}
      disabled={disabled}
      testId={testId}
    />
  );
  wrappers.set(Component, wrapper);
  return wrapper;
}
