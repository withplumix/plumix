import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { getPluginFieldType } from "@/lib/plugin-registry.js";

import type { PluginFieldControl } from "@plumix/admin-editor";
import type { BlockInput } from "@plumix/blocks";
import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

type PluginFieldComponent = NonNullable<ReturnType<typeof getPluginFieldType>>;

// Adapt a block input onto the metabox field-manifest shape plugin field
// renderers already expect, so one `registerPluginFieldType` registration
// serves both the metabox form and the block inspector. Only the field the
// reference pickers read is projected — the reference `scope` (accept).
function inputToField(input: BlockInput): MetaBoxFieldManifestEntry {
  return {
    key: input.name,
    label: input.label ?? input.name,
    type: "json",
    inputType: input.type,
    referenceTarget: {
      kind: input.type,
      scope: input.accept === undefined ? undefined : { accept: input.accept },
    },
  };
}

// The editor owns its inputs directly, so nothing needs the RHF ref — but a
// control may still spread it onto an element, and a no-op callback ref is
// what React expects there.
const NOOP_REF = (): void => undefined;

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
  const wrapper: PluginFieldControl = ({
    field,
    rhf,
    disabled,
    testId,
    attrs,
  }) => {
    // Built rather than asserted. The editor's `rhf` carries four of the six
    // members RHF's own controller has; `ref` is the one a control could
    // legitimately spread onto an input, so it gets a real no-op callback
    // instead of the `undefined` a cast would have left behind.
    const controller: ControllerRenderProps<FieldValues, string> = {
      value: rhf.value,
      onChange: rhf.onChange,
      onBlur: rhf.onBlur,
      name: rhf.name,
      disabled,
      ref: NOOP_REF,
    };
    return (
      <Component
        field={inputToField(field as BlockInput)}
        rhf={controller}
        disabled={disabled}
        testId={testId}
        attrs={attrs}
      />
    );
  };
  wrappers.set(Component, wrapper);
  return wrapper;
}
