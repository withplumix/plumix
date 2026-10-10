import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { getPluginFieldType } from "@/lib/plugin-registry.js";

import type { PluginFieldControl } from "@plumix/admin-editor";
import type { BlockInput } from "@plumix/core/blocks";
import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

type PluginFieldComponent = NonNullable<ReturnType<typeof getPluginFieldType>>;

/** Projects only what the reference pickers read: the `scope`. */
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

/** A control may still spread the RHF ref onto an element. */
const NOOP_REF = (): void => undefined;

/** A new identity per render would remount the picker and its open modal. */
const wrappers = new WeakMap<PluginFieldComponent, PluginFieldControl>();

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
    // Built rather than asserted, so `ref` is a real no-op callback, not
    // `undefined`.
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
