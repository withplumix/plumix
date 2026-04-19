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
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { getPasskeyErrorMessage, PasskeyError } from "@/lib/passkey-errors.js";
import { registerWithPasskey } from "@/lib/passkey.js";
import { SESSION_QUERY_KEY, sessionQueryOptions } from "@/lib/session.js";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import * as v from "valibot";

import { bootstrapSchema } from "./-schemas.js";

export const Route = createFileRoute("/_auth/bootstrap")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(),
    );
    if (!session.needsBootstrap) {
      // Once someone's claimed the bootstrap slot, /bootstrap becomes /login
      // to avoid dead-end UX; the server would reject a post-bootstrap
      // registration attempt with `registration_closed` regardless.
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/login" });
    }
  },
  component: BootstrapRoute,
});

function BootstrapRoute(): ReactNode {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const createAccount = useMutation({
    mutationFn: (input: { email: string; name?: string }) =>
      registerWithPasskey(input),
    onMutate: () => setErrorCode(null),
    onSuccess: async () => {
      await router.options.context.queryClient.invalidateQueries({
        queryKey: SESSION_QUERY_KEY,
      });
      await router.navigate({ to: "/" });
    },
    onError: (err) => {
      setErrorCode(err instanceof PasskeyError ? err.code : "unknown");
    },
  });

  const form = useForm({
    defaultValues: { email: "", name: "" },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(bootstrapSchema, value);
        return result.success ? undefined : result.issues[0].message;
      },
    },
    onSubmit: ({ value }) => {
      createAccount.mutate({
        email: value.email,
        ...(value.name ? { name: value.name } : {}),
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Create admin account</h1>
        </CardTitle>
        <CardDescription>
          Set up your site — this email becomes the admin account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field
            name="email"
            validators={{
              onBlur: ({ value }) => {
                const result = v.safeParse(
                  v.object({ email: bootstrapSchema.entries.email }),
                  { email: value },
                );
                return result.success ? undefined : result.issues[0].message;
              },
            }}
          >
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="username webauthn"
                  required
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  disabled={createAccount.isPending}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  aria-describedby={
                    field.state.meta.errors.length > 0
                      ? `${field.name}-error`
                      : undefined
                  }
                />
                {field.state.meta.errors.length > 0 ? (
                  <p
                    id={`${field.name}-error`}
                    className="text-destructive text-xs"
                  >
                    {String(field.state.meta.errors[0])}
                  </p>
                ) : null}
              </div>
            )}
          </form.Field>

          <form.Field name="name">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={field.name}>
                  Name <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="text"
                  autoComplete="name"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  disabled={createAccount.isPending}
                />
              </div>
            )}
          </form.Field>

          {errorCode ? (
            <Alert variant="destructive">
              <AlertDescription>
                {getPasskeyErrorMessage(errorCode)}
              </AlertDescription>
            </Alert>
          ) : null}

          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <Button
                type="submit"
                disabled={!canSubmit || createAccount.isPending}
              >
                {createAccount.isPending
                  ? "Creating account…"
                  : "Create account with passkey"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
