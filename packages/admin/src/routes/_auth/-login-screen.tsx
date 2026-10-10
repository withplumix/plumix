import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { LoginLocaleSwitcher } from "@/components/login-locale-switcher.js";
import { useEmailChangeErrorMessage } from "@/lib/email-change-errors.js";
import { useMagicLinkErrorMessage } from "@/lib/magic-link-errors.js";
import {
  magicLinkRequestErrorDescriptor,
  requestMagicLink,
} from "@/lib/magic-link.js";
import { readManifest } from "@/lib/manifest.js";
import { useOAuthErrorMessage } from "@/lib/oauth-errors.js";
import { orpc } from "@/lib/orpc.js";
import { PasskeyError, usePasskeyErrorMessage } from "@/lib/passkey-errors.js";
import { signInWithPasskey } from "@/lib/passkey.js";
import { refetchSession } from "@/lib/session.js";
import { useLabel } from "@/lib/use-label.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { defineMessage } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@plumix/admin-ui/alert";
import { Button } from "@plumix/admin-ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plumix/admin-ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@plumix/admin-ui/form";
import { Input } from "@plumix/admin-ui/input";
import { Separator } from "@plumix/admin-ui/separator";

import type { LoginSearch } from "./-schemas.js";
import { buildLocaleSwitchUrl, writeLocaleCookie } from "./-locale-param.js";
import { loginSchema } from "./-schemas.js";

const M = {
  emailRequired: defineMessage({
    id: "login.magicLink.emailRequired",
    message: "Enter your email above first.",
  }),
} satisfies Record<string, MessageDescriptor>;

// Split out of `login.tsx` so a test can mount the screen without the
// file-based route tree; the route only hands it the validated search.
export function LoginScreen({ search }: { search: LoginSearch }): ReactNode {
  const router = useRouter();
  const manifest = readManifest();
  const { i18n } = useLingui();
  const renderLabel = useLabel();
  const renderPasskeyError = usePasskeyErrorMessage();
  const renderMagicLinkError = useMagicLinkErrorMessage();
  const renderOAuthError = useOAuthErrorMessage();
  const renderEmailChangeError = useEmailChangeErrorMessage();
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkError, setMagicLinkError] =
    useState<MessageDescriptor | null>(null);

  const signInMethods = useQuery(orpc.auth.signInMethods.queryOptions());
  const magicLinkEnabled = signInMethods.data?.magicLink === true;
  const oauth = signInMethods.data?.oauth ?? [];

  const signIn = useMutation({
    mutationFn: (input: { email?: string }) => signInWithPasskey(input.email),
    onMutate: () => setPasskeyError(null),
    onSuccess: async () => {
      await refetchSession(router.options.context.queryClient);
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
    onError: (err) => setMagicLinkError(magicLinkRequestErrorDescriptor(err)),
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
      setMagicLinkError(M.emailRequired);
      return;
    }
    magicLink.mutate({ email });
  };

  // `?lang=` covers the first SSR after reload, before the cookie is on the
  // wire.
  const handleLocaleSelect = (code: string): void => {
    writeLocaleCookie(code);
    window.location.assign(buildLocaleSwitchUrl(search, code));
  };

  const oauthErrorMessage = renderOAuthError(search.oauth_error);
  const magicLinkUrlError = renderMagicLinkError(search.magic_link_error);
  const emailChangeUrlError = renderEmailChangeError(search.email_change_error);
  // Not pinned to "1": a search round-tripped through other routes can
  // reserialize.
  const emailChangeSuccess = Boolean(search.email_change_success);

  if (magicLinkSent) {
    return (
      <Card data-testid="login-magic-link-sent">
        <CardHeader>
          <CardTitle>
            <h1 data-testid="login-heading">
              <Trans
                id="login.magicLink.sent.title"
                message="Check your email"
              />
            </h1>
          </CardTitle>
          <CardDescription>
            <Trans
              id="login.magicLink.sent.description"
              message="If an account exists for this email, we sent a sign-in link. The link expires in 15 minutes."
            />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            onClick={() => setMagicLinkSent(false)}
            data-testid="login-magic-link-back"
          >
            <Trans id="login.magicLink.back" message="Back" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 data-testid="login-heading">
            <Trans id="login.title" message="Sign in" />
          </h1>
        </CardTitle>
        <CardDescription>
          <Trans
            id="login.description"
            message="Use a passkey, get a one-time email link, or continue with a provider."
          />
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
                  <FormLabel>
                    <Trans id="login.email.label" message="Email" />
                  </FormLabel>
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
                  {renderPasskeyError(passkeyError)}
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
                <AlertDescription>
                  {renderLabel(magicLinkError)}
                </AlertDescription>
              </Alert>
            ) : null}

            {emailChangeSuccess ? (
              <Alert data-testid="login-email-change-success">
                <AlertDescription>
                  <Trans
                    id="login.emailChange.success"
                    message="Email confirmed. Sign in with the new address."
                  />
                </AlertDescription>
              </Alert>
            ) : null}

            {emailChangeUrlError ? (
              <Alert
                variant="destructive"
                data-testid="login-email-change-error"
              >
                <AlertDescription>{emailChangeUrlError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={signIn.isPending || magicLink.isPending}
                data-testid="login-passkey-submit"
              >
                {signIn.isPending ? (
                  <Trans id="login.passkey.pending" message="Signing in…" />
                ) : (
                  <Trans
                    id="login.passkey.submit"
                    message="Sign in with passkey"
                  />
                )}
              </Button>
              {magicLinkEnabled ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={onMagicLinkClick}
                  disabled={signIn.isPending || magicLink.isPending}
                  data-testid="login-magic-link-submit"
                >
                  {magicLink.isPending ? (
                    <Trans id="login.magicLink.pending" message="Sending…" />
                  ) : (
                    <Trans
                      id="login.magicLink.submit"
                      message="Email me a link"
                    />
                  )}
                </Button>
              ) : null}
            </div>
          </form>
        </Form>

        {oauth.length > 0 ? (
          <div
            className="mt-6 flex flex-col gap-3"
            data-testid="login-oauth-providers"
          >
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs tracking-wide uppercase">
                <Trans id="login.oauth.separator" message="or" />
              </span>
              <Separator className="flex-1" />
            </div>
            {oauth.map(({ key, label }) => (
              <Button
                key={key}
                asChild
                variant="outline"
                data-testid={`login-oauth-${key}`}
              >
                <a href={`/_plumix/auth/oauth/${key}/start`}>
                  <Trans
                    id="login.oauth.continueWith"
                    message="Continue with {label}"
                    values={{ label: <bdi>{label}</bdi> }}
                    comment="label: the OAuth provider's display name (e.g. 'Google', 'GitHub')"
                  />
                </a>
              </Button>
            ))}
          </div>
        ) : null}
        <LoginLocaleSwitcher
          currentCode={i18n.locale}
          manifest={manifest}
          onSelect={handleLocaleSelect}
        />
      </CardContent>
    </Card>
  );
}
