import type { MetaBoxFieldManifestEntry } from "plumix/plugin";
import type { ReactNode } from "react";
import { Input } from "plumix/admin/ui";
import { resolveLabel, useLingui } from "plumix/i18n";
import * as v from "valibot";

// An empty control is what a cleared field already shows, so a value that
// turns out to be anything but a string reads as unset.
const storedTelSchema = v.fallback(v.string(), "");

/**
 * The admin renderer for the `tel` field type this plugin contributes.
 * Core has no built-in for it, so without this registration every `tel`
 * field in the admin falls through to the host's plain-text fallback —
 * losing the numeric keypad on a touch device and warning on every
 * render.
 *
 * Deliberately unvalidated: phone numbers have no format worth enforcing
 * across borders, which is the whole reason `tel` is not `text`.
 */
export function TelField({
  field,
  rhf,
  disabled,
  testId,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly rhf: {
    /** Not JSON: react-hook-form holds whatever the field last seeded. */
    readonly value: unknown;
    readonly onChange: (next: string) => void;
    readonly onBlur: () => void;
    readonly name: string;
  };
  readonly disabled: boolean;
  readonly testId: string;
}): ReactNode {
  const { i18n } = useLingui();
  return (
    <Input
      type="tel"
      name={rhf.name}
      data-testid={testId}
      disabled={disabled}
      maxLength={field.maxLength}
      placeholder={
        field.placeholder === undefined
          ? undefined
          : resolveLabel(field.placeholder, i18n)
      }
      value={v.parse(storedTelSchema, rhf.value)}
      onBlur={rhf.onBlur}
      onChange={(event) => {
        rhf.onChange(event.target.value);
      }}
    />
  );
}
