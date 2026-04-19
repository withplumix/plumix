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
import { signInWithPasskey } from "@/lib/passkey.js";
import { SESSION_QUERY_KEY, sessionQueryOptions } from "@/lib/session.js";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import * as v from "valibot";

import { loginSchema } from "./-schemas.js";

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
          <h1>Sign in</h1>
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
                const result = v.safeParse(loginSchema, { email: value });
                return result.success ? undefined : result.issues[0].message;
              },
            }}
          >
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={field.name}>
                  Email{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="username webauthn"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  disabled={signIn.isPending}
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
