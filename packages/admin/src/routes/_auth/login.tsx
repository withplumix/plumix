import type { ReactNode } from "react";
import { useState } from "react";
import { FormField } from "@/components/form/field.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { getPasskeyErrorMessage, PasskeyError } from "@/lib/passkey-errors.js";
import { signInWithPasskey } from "@/lib/passkey.js";
import { SESSION_QUERY_KEY, sessionQueryOptions } from "@/lib/session.js";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import * as v from "valibot";

import { loginEmailFieldSchema, loginSchema } from "./-schemas.js";

export const Route = createFileRoute("/_auth/login")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(),
    );
    if (session.needsBootstrap) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/bootstrap" });
    }
  },
  component: LoginRoute,
});

function LoginRoute(): ReactNode {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const signIn = useMutation({
    mutationFn: (input: { email?: string }) => signInWithPasskey(input.email),
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
    defaultValues: { email: "" },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(loginSchema, value);
        return result.success ? undefined : result.issues[0].message;
      },
    },
    onSubmit: ({ value }) => {
      signIn.mutate({ email: value.email || undefined });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 data-testid="login-heading">Sign in</h1>
        </CardTitle>
        <CardDescription>
          Use a passkey registered with this site.
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
              onChange: ({ value }) => {
                if (!value) return undefined;
                const result = v.safeParse(loginEmailFieldSchema, {
                  email: value,
                });
                return result.success ? undefined : result.issues[0].message;
              },
            }}
          >
            {(field) => (
              <FormField
                field={field}
                label={
                  <>
                    Email{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </>
                }
                type="email"
                autoComplete="username webauthn"
                disabled={signIn.isPending}
              />
            )}
          </form.Field>

          {errorCode ? (
            <Alert variant="destructive">
              <AlertDescription>
                {getPasskeyErrorMessage(errorCode)}
              </AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={signIn.isPending}>
            {signIn.isPending ? "Signing in…" : "Sign in with passkey"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
