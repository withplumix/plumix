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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.js";
import { Input } from "@/components/ui/input.js";
import { Separator } from "@/components/ui/separator.js";
import { getOAuthErrorMessage } from "@/lib/oauth-errors.js";
import { orpc } from "@/lib/orpc.js";
import { getPasskeyErrorMessage, PasskeyError } from "@/lib/passkey-errors.js";
import { signInWithPasskey } from "@/lib/passkey.js";
import { SESSION_QUERY_KEY, sessionQueryOptions } from "@/lib/session.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import * as v from "valibot";

import { loginSchema } from "./-schemas.js";

const loginSearchSchema = v.object({
  oauth_error: v.optional(v.string()),
});

export const Route = createFileRoute("/_auth/login")({
  validateSearch: loginSearchSchema,
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
  const search = Route.useSearch();
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const providers = useQuery(orpc.auth.oauthProviders.queryOptions());

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
    resolver: valibotResolver(loginSchema),
    defaultValues: { email: "" },
    mode: "onChange",
  });

  const onSubmit = form.handleSubmit(({ email }) => {
    signIn.mutate({ email: email || undefined });
  });

  const oauthErrorMessage = getOAuthErrorMessage(search.oauth_error);

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
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="username webauthn"
                      disabled={signIn.isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {errorCode ? (
              <Alert variant="destructive" data-testid="login-passkey-error">
                <AlertDescription>
                  {getPasskeyErrorMessage(errorCode)}
                </AlertDescription>
              </Alert>
            ) : null}

            {oauthErrorMessage ? (
              <Alert variant="destructive" data-testid="login-oauth-error">
                <AlertDescription>{oauthErrorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={signIn.isPending}>
              {signIn.isPending ? "Signing in…" : "Sign in with passkey"}
            </Button>
          </form>
        </Form>

        {providers.data && providers.data.length > 0 ? (
          <div
            className="mt-6 flex flex-col gap-3"
            data-testid="login-oauth-providers"
          >
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs tracking-wide uppercase">
                or
              </span>
              <Separator className="flex-1" />
            </div>
            {providers.data.map(({ key, label }) => (
              <Button
                key={key}
                asChild
                variant="outline"
                data-testid={`login-oauth-${key}`}
              >
                <a href={`/_plumix/auth/oauth/${key}/start`}>
                  Continue with {label}
                </a>
              </Button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
