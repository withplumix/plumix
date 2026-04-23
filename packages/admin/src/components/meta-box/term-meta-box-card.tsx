import type { ReactNode } from "react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { orpc } from "@/lib/orpc.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { TermMetaBoxManifestEntry } from "@plumix/core/manifest";

import { MetaBoxField } from "./meta-box-field.js";

function seedFromTerm(
  fields: TermMetaBoxManifestEntry["fields"],
  meta: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> {
  const bag = meta ?? {};
  const seed: Record<string, unknown> = {};
  for (const field of fields) {
    seed[field.key] = bag[field.key] ?? field.default;
  }
  return seed;
}

/**
 * One shadcn `<Card>` for a registered term meta box. Each card is an
 * independent form — its Save button fires `term.update` with just
 * that box's fields as the meta patch, same per-card atomic save model
 * as settings pages.
 */
export function TermMetaBoxCard({
  box,
  term,
  taxonomyName,
  disabled = false,
}: {
  readonly box: TermMetaBoxManifestEntry;
  readonly term: {
    readonly id: number;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  readonly taxonomyName: string;
  readonly disabled?: boolean;
}): ReactNode {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    seedFromTerm(box.fields, term.meta),
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (next: Record<string, unknown>) =>
      orpc.term.update.call({ id: term.id, meta: next }),
    onMutate: () => {
      setServerError(null);
      setSaveNotice(null);
    },
    onSuccess: async (data) => {
      // Re-seed from the server's authoritative post-sanitize bag so
      // the form reflects any trimming / coercion the server applied
      // (see `coerceOnRead` / plugin sanitize hooks).
      setValues(seedFromTerm(box.fields, data.meta));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.term.get.queryOptions({ input: { id: term.id } })
            .queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.term.list.key({ input: { taxonomy: taxonomyName } }),
        }),
      ]);
      setSaveNotice("Saved.");
    },
    onError: (err) => {
      setServerError(
        err instanceof Error ? err.message : "Couldn't save these fields.",
      );
    },
  });

  return (
    <Card data-testid={`term-meta-box-${box.id}`}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          save.mutate(values);
        }}
      >
        <CardHeader>
          <CardTitle>
            <h2
              className="text-lg font-semibold"
              data-testid={`term-meta-box-heading-${box.id}`}
            >
              {box.label}
            </h2>
          </CardTitle>
          {box.description ? (
            <CardDescription>{box.description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {box.fields.map((field) => (
            <MetaBoxField
              key={field.key}
              field={field}
              value={values[field.key]}
              disabled={disabled || save.isPending}
              onChange={(next) => {
                setValues((prev) => ({ ...prev, [field.key]: next }));
              }}
            />
          ))}

          {serverError ? (
            <Alert
              variant="destructive"
              role="alert"
              data-testid={`term-meta-box-error-${box.id}`}
            >
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          {saveNotice ? (
            <Alert
              aria-live="polite"
              data-testid={`term-meta-box-notice-${box.id}`}
            >
              <AlertDescription>{saveNotice}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <div className="flex justify-end px-6 pb-6">
          <Button
            type="submit"
            disabled={disabled || save.isPending}
            data-testid={`term-meta-box-submit-${box.id}`}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
