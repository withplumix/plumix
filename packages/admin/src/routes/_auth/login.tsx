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
import { getMagicLinkErrorMessage } from "@/lib/magic-link-errors.js";
import { MagicLinkRequestError, requestMagicLink } from "@/lib/magic-link.js";
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
  magic_link_error: v.optional(v.string()),
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
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);

  const providers = useQuery(orpc.auth.oauthProviders.queryOptions());

  const signIn = useMutation({
    mutationFn: (input: { email?: string }) => signInWithPasskey(input.email),
    onMutate: () => setPasskeyError(null),
    onSuccess: async () => {
      await router.options.context.queryClient.invalidateQueries({
        queryKey: SESSION_QUERY_KEY,
      });
      await router.navigate({ to: "/" });
    },
    onError: (err) => {
      setPasskeyError(err instanceof PasskeyError ? err.code : "unknown");
    },
  });

  const magicLink = useMutation({
    mutationFn: (input: { email: string }) => requestMagicLink(input.email),
    onMutate: () => {
      setMagicLinkError(null);
      setMagicLinkSent(false);
    },
    onSuccess: () => setMagicLinkSent(true),
    onError: (err) => {
      if (err instanceof MagicLinkRequestError) {
        setMagicLinkError(
          err.code === "not_configured"
            ? "Magic-link sign-in isn't configured on this site."
            : err.code === "invalid_input"
              ? "Enter a valid email address."
              : "Couldn't send the link. Try again.",
        );
        return;
      }
      setMagicLinkError("Couldn't send the link. Try again.");
    },
  });

  const form = useForm({
    resolver: valibotResolver(loginSchema),
    defaultValues: { email: "" },
    mode: "onChange",
  });

  const onPasskeySubmit = form.handleSubmit(({ email }) => {
    signIn.mutate({ email: email || undefined });
  });

  const onMagicLinkClick = (): void => {
    const email = form.getValues("email").trim();
    if (!email) {
      setMagicLinkError("Enter your email above first.");
      return;
    }
    magicLink.mutate({ email });
  };

  const oauthErrorMessage = getOAuthErrorMessage(search.oauth_error);
  const magicLinkUrlError = getMagicLinkErrorMessage(search.magic_link_error);

  if (magicLinkSent) {
    return (
      <Card data-testid="login-magic-link-sent">
        <CardHeader>
          <CardTitle>
            <h1 data-testid="login-heading">Check your email</h1>
          </CardTitle>
          <CardDescription>
            If an account exists for this email, we sent a sign-in link. The
            link expires in 15 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            onClick={() => setMagicLinkSent(false)}
            data-testid="login-magic-link-back"
          >
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 data-testid="login-heading">Sign in</h1>
        </CardTitle>
        <CardDescription>
          Use a passkey, get a one-time email link, or continue with a provider.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={onPasskeySubmit}>
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
                      disabled={signIn.isPending || magicLink.isPending}
                      data-testid="login-email-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {passkeyError ? (
              <Alert variant="destructive" data-testid="login-passkey-error">
                <AlertDescription>
                  {getPasskeyErrorMessage(passkeyError)}
                </AlertDescription>
              </Alert>
            ) : null}

            {oauthErrorMessage ? (
              <Alert variant="destructive" data-testid="login-oauth-error">
                <AlertDescription>{oauthErrorMessage}</AlertDescription>
              </Alert>
            ) : null}

            {magicLinkUrlError ? (
              <Alert
                variant="destructive"
                data-testid="login-magic-link-url-error"
              >
                <AlertDescription>{magicLinkUrlError}</AlertDescription>
              </Alert>
            ) : null}

            {magicLinkError ? (
              <Alert variant="destructive" data-testid="login-magic-link-error">
                <AlertDescription>{magicLinkError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={signIn.isPending || magicLink.isPending}
                data-testid="login-passkey-submit"
              >
                {signIn.isPending ? "Signing in…" : "Sign in with passkey"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={onMagicLinkClick}
                disabled={signIn.isPending || magicLink.isPending}
                data-testid="login-magic-link-submit"
              >
                {magicLink.isPending ? "Sending…" : "Email me a link"}
              </Button>
            </div>
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
