import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { LoginLocaleSwitcher } from "@/components/login-locale-switcher.js";
import { useEmailChangeErrorMessage } from "@/lib/email-change-errors.js";
import { useMagicLinkErrorMessage } from "@/lib/magic-link-errors.js";
import {
  magicLinkEmailError,
  magicLinkRequestErrorDescriptor,
} from "@/lib/magic-link-request.js";
import { readManifest } from "@/lib/manifest.js";
import { useOAuthErrorMessage } from "@/lib/oauth-errors.js";
import { orpc } from "@/lib/orpc.js";
import {
  PasskeyError,
  unwrapPasskeyResult,
  usePasskeyErrorMessage,
} from "@/lib/passkey-errors.js";
import { refetchSession } from "@/lib/session.js";
import { useLabel } from "@/lib/use-label.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { Trans, useLingui } from "@lingui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useForm } from "react-hook-form";

import type { AuthResult } from "@plumix/core/auth/client";
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
import { authClient } from "@plumix/core/auth/client";

import type { LoginSearch } from "./-schemas.js";
import { buildLocaleSwitchUrl, writeLocaleCookie } from "./-locale-param.js";
import { loginSchema } from "./-schemas.js";

/** Core's methods, which this screen renders controls of its own for. */
const CORE_METHODS: ReadonlySet<string> = new Set([
  /* eslint-disable lingui/no-unlocalized-strings -- method names, not UI copy */
  "passkey",
  "magic-link",
  "oauth",
  "invite",
  /* eslint-enable lingui/no-unlocalized-strings */
]);

/** A plugin method's sign-in, which `authClient` mounts by camelCase name. */
function pluginSignIn(
  name: string,
): (() => Promise<AuthResult<unknown>>) | undefined {
  const key = name.replace(/-([a-z0-9])/g, (_, next: string) =>
    next.toUpperCase(),
  );
  const signIns: Readonly<Record<string, unknown>> = authClient.signIn;
  const run = signIns[key];
  if (typeof run !== "function") return undefined;
  // Safety: every method half's `signIn` resolves an `AuthResult`, and a
  // plugin method the admin lists signs in with no arguments.
  return run as () => Promise<AuthResult<unknown>>;
}

/** The route only hands this screen the validated search. */
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
  // Not pinned to "1": a search round-tripped through other routes can
  // reserialize.
  const [magicLinkSent, setMagicLinkSent] = useState(
    Boolean(search.magic_link_sent),
  );
  const [magicLinkError, setMagicLinkError] =
    useState<MessageDescriptor | null>(null);

  const signInMethods = useQuery(orpc.auth.signInMethods.queryOptions());
  const magicLinkEnabled =
    signInMethods.data?.methods.some(({ name }) => name === "magic-link") ===
    true;
  const oauth = signInMethods.data?.oauth ?? [];
  const pluginMethods = (signInMethods.data?.methods ?? []).filter(
    ({ name }) => !CORE_METHODS.has(name),
  );
  const [methodError, setMethodError] = useState<MessageDescriptor | null>(
    null,
  );

  const signIn = useMutation({
    mutationFn: async (input: { email?: string }) =>
      unwrapPasskeyResult(
        await authClient.signIn.passkey(
          input.email ? { email: input.email } : {},
        ),
      ),
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
    mutationFn: (input: { email: string }) =>
      authClient.signIn.magicLink({ email: input.email }),
    onMutate: () => {
      setMagicLinkError(null);
      setMagicLinkSent(false);
    },
    onSuccess: ({ error }) => {
      if (error) {
        setMagicLinkError(magicLinkRequestErrorDescriptor(error.code));
        return;
      }
      setMagicLinkSent(true);
    },
  });

  const methodSignIn = useMutation({
    mutationFn: async (name: string) => (await pluginSignIn(name)?.()) ?? null,
    onMutate: () => setMethodError(null),
    onSuccess: async (result) => {
      if (result?.error) {
        setMethodError(result.error.message);
        return;
      }
      await refetchSession(router.options.context.queryClient);
      await router.navigate({ to: "/" });
    },
  });
  const pending =
    signIn.isPending || magicLink.isPending || methodSignIn.isPending;

  const form = useForm({
    resolver: valibotResolver(loginSchema),
    defaultValues: { email: "" },
    mode: "onChange",
  });

  const onPasskeySubmit = form.handleSubmit(({ email }) => {
    signIn.mutate({ email: email || undefined });
  });

  const onMagicLinkClick = (): void => {
    const email = form.getValues("email");
    const emailError = magicLinkEmailError(email);
    if (emailError) {
      setMagicLinkError(emailError);
      return;
    }
    magicLink.mutate({ email: email.trim() });
  };

  // `?lang=` covers the first SSR after reload, before the cookie is on the
  // wire.
  const handleLocaleSelect = (code: string): void => {
    writeLocaleCookie(code);
    window.location.assign(
      buildLocaleSwitchUrl(search, code, window.location.pathname),
    );
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
                      disabled={pending}
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

            {methodError ? (
              <Alert variant="destructive" data-testid="login-method-error">
                <AlertDescription>{renderLabel(methodError)}</AlertDescription>
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
                disabled={pending}
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
                  disabled={pending}
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

        {pluginMethods.length > 0 ? (
          <div
            className="mt-6 flex flex-col gap-3"
            data-testid="login-plugin-methods"
          >
            {pluginMethods.map(({ name, label }) => (
              <Button
                key={name}
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => methodSignIn.mutate(name)}
                data-testid={`login-method-${name}`}
              >
                <Trans
                  id="login.method.continueWith"
                  message="Continue with {label}"
                  values={{ label: <bdi>{label}</bdi> }}
                  comment="label: the sign-in method's display name, from the plugin that adds it"
                />
              </Button>
            ))}
          </div>
        ) : null}

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
                <a
                  href={authClient.url({
                    method: "oauth",
                    route: `${encodeURIComponent(key)}/start`,
                  })}
                >
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
