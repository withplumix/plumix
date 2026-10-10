"use client";

import type { Label as LabelPrimitive } from "radix-ui";
import type { ControllerProps, FieldPath, FieldValues } from "react-hook-form";
import * as React from "react";
import { Slot } from "radix-ui";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
} from "react-hook-form";

import { AdminUiError } from "./errors.js";
import { Label } from "./label.js";
import { cn } from "./utils.js";

const Form = FormProvider;

interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  name: TName;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(
  null,
);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  if (!fieldContext) {
    throw AdminUiError.missingFormField();
  }
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

interface FormItemContextValue {
  id: string;
}

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue,
);

/**
 * Mobile-first 12-column span measured at the grid container's width; values
 * outside 1..12 are clamped.
 */
type FormItemSpan =
  | number
  | {
      readonly base?: number;
      readonly sm?: number;
      readonly md?: number;
      readonly lg?: number;
    };

type SpanValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * Tailwind only generates a class it can see verbatim in source, so every
 * span at every breakpoint is spelled out rather than built from `n`.
 */
const BASE_SPAN: Record<SpanValue, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
  7: "col-span-7",
  8: "col-span-8",
  9: "col-span-9",
  10: "col-span-10",
  11: "col-span-11",
  12: "col-span-12",
};

const SM_SPAN: Record<SpanValue, string> = {
  1: "@sm:col-span-1",
  2: "@sm:col-span-2",
  3: "@sm:col-span-3",
  4: "@sm:col-span-4",
  5: "@sm:col-span-5",
  6: "@sm:col-span-6",
  7: "@sm:col-span-7",
  8: "@sm:col-span-8",
  9: "@sm:col-span-9",
  10: "@sm:col-span-10",
  11: "@sm:col-span-11",
  12: "@sm:col-span-12",
};

const MD_SPAN: Record<SpanValue, string> = {
  1: "@md:col-span-1",
  2: "@md:col-span-2",
  3: "@md:col-span-3",
  4: "@md:col-span-4",
  5: "@md:col-span-5",
  6: "@md:col-span-6",
  7: "@md:col-span-7",
  8: "@md:col-span-8",
  9: "@md:col-span-9",
  10: "@md:col-span-10",
  11: "@md:col-span-11",
  12: "@md:col-span-12",
};

const LG_SPAN: Record<SpanValue, string> = {
  1: "@lg:col-span-1",
  2: "@lg:col-span-2",
  3: "@lg:col-span-3",
  4: "@lg:col-span-4",
  5: "@lg:col-span-5",
  6: "@lg:col-span-6",
  7: "@lg:col-span-7",
  8: "@lg:col-span-8",
  9: "@lg:col-span-9",
  10: "@lg:col-span-10",
  11: "@lg:col-span-11",
  12: "@lg:col-span-12",
};

const FULL_SPAN: SpanValue = 12;

function clampSpan(n: number): SpanValue {
  if (!Number.isFinite(n)) return FULL_SPAN;
  const rounded = Math.round(n);
  if (rounded < 1) return 1;
  if (rounded > 12) return 12;
  return rounded as SpanValue;
}

function spanClasses(span: FormItemSpan | undefined): string | undefined {
  if (span === undefined) return undefined;
  if (typeof span === "number") return BASE_SPAN[clampSpan(span)];
  return cn(
    BASE_SPAN[clampSpan(span.base ?? FULL_SPAN)],
    span.sm !== undefined && SM_SPAN[clampSpan(span.sm)],
    span.md !== undefined && MD_SPAN[clampSpan(span.md)],
    span.lg !== undefined && LG_SPAN[clampSpan(span.lg)],
  );
}

function FormItem({
  className,
  span,
  ...props
}: React.ComponentProps<"div"> & { span?: FormItemSpan }) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        data-slot="form-item"
        className={cn("grid gap-2", spanClasses(span), className)}
        {...props}
      />
    </FormItemContext.Provider>
  );
}

function FormLabel({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const { error, formItemId } = useFormField();

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  );
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot.Root>) {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();

  return (
    <Slot.Root
      data-slot="form-control"
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { formDescriptionId } = useFormField();

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField();
  const body = error ? (error.message ?? "") : props.children;

  if (!body) {
    return null;
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn("text-destructive text-sm", className)}
      {...props}
    >
      {body}
    </p>
  );
}

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};
export type { FormItemSpan };
