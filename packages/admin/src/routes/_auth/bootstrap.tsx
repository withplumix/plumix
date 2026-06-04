import type { ReactNode } from "react";
import { useState } from "react";
import { LoginLocaleSwitcher } from "@/components/login-locale-switcher.js";
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
import { readManifest } from "@/lib/manifest.js";
import { PasskeyError, usePasskeyErrorMessage } from "@/lib/passkey-errors.js";
import { registerWithPasskey } from "@/lib/passkey.js";
import { SESSION_QUERY_KEY, sessionQueryOptions } from "@/lib/session.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { Trans, useLingui } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useForm } from "react-hook-form";

import { buildLocaleSwitchUrl, writeLocaleCookie } from "./-locale-param.js";
import { bootstrapSchema, langOnlySearchSchema } from "./-schemas.js";

export const Route = createFileRoute("/_auth/bootstrap")({
  validateSearch: langOnlySearchSchema,
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
  const renderPasskeyError = usePasskeyErrorMessage();
  const router = useRouter();
  const search = Route.useSearch();
  const manifest = readManifest();
  const { i18n } = useLingui();
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const handleLocaleSelect = (code: string): void => {
    writeLocaleCookie(code);
    window.location.assign(buildLocaleSwitchUrl(search, code));
  };

  const createAccount = useMutation({
    mutationFn: registerWithPasskey,
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
    resolver: valibotResolver(bootstrapSchema),
    defaultValues: { email: "", name: "" },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((value) => {
    createAccount.mutate({
      email: value.email,
      ...(value.name ? { name: value.name } : {}),
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 data-testid="bootstrap-heading">
            <Trans id="auth.bootstrap.title" message="Create admin account" />
          </h1>
        </CardTitle>
        <CardDescription>
          <Trans
            id="auth.bootstrap.description"
            message="Set up your site — this email becomes the admin account."
          />
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
                  <FormLabel>
                    <Trans id="auth.bootstrap.email" message="Email" />
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="username webauthn"
                      required
                      disabled={createAccount.isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <Trans id="auth.bootstrap.name" message="Name" />
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      autoComplete="name"
                      disabled={createAccount.isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {errorCode ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {renderPasskeyError(errorCode)}
                </AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={createAccount.isPending}>
              {createAccount.isPending ? (
                <Trans
                  id="auth.bootstrap.submit.pending"
                  message="Creating account…"
                />
              ) : (
                <Trans
                  id="auth.bootstrap.submit.idle"
                  message="Create account with passkey"
                />
              )}
            </Button>
          </form>
        </Form>
        <LoginLocaleSwitcher
          currentCode={i18n.locale}
          manifest={manifest}
          onSelect={handleLocaleSelect}
        />
      </CardContent>
    </Card>
  );
}
