import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";

// Narrow view of a TanStack Form field — just the slots FormField touches.
// Accepting this instead of `AnyFieldApi` (whose generics resolve to `any`)
// keeps the component type-safe without dragging the caller's full form
// generics through the prop type.
interface TextFieldLike {
  readonly name: string;
  readonly state: {
    readonly value: string;
    readonly meta: { readonly errors: readonly unknown[] };
  };
  readonly handleBlur: () => void;
  readonly handleChange: (value: string) => void;
}

type InputProps = Omit<
  ComponentProps<"input">,
  | "id"
  | "name"
  | "value"
  | "onBlur"
  | "onChange"
  | "aria-invalid"
  | "aria-describedby"
>;

interface FormFieldProps extends InputProps {
  readonly field: TextFieldLike;
  readonly label: ReactNode;
}

// Wires a TanStack Form field to Label + Input + error-paragraph with the
// full ARIA dance (`aria-invalid`, `aria-describedby` pointing at the error
// node). Every auth-adjacent form is expected to use this — consistency of
// error rendering is part of the accessibility contract.
export function FormField({
  field,
  label,
  ...inputProps
}: FormFieldProps): ReactNode {
  const errors = field.state.meta.errors;
  const hasError = errors.length > 0;
  const errorId = `${field.name}-error`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={field.name}>{label}</Label>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        {...inputProps}
      />
      {hasError ? (
        <p id={errorId} className="text-destructive text-xs">
          {String(errors[0])}
        </p>
      ) : null}
    </div>
  );
}
