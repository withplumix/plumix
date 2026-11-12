import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { adminBasePath } from "@/lib/admin-base.js";
import { orpc } from "@/lib/orpc.js";
import { Trans } from "@lingui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { Alert, AlertDescription } from "@plumix/admin-ui/alert";

import type { ConsentClient, ConsentScope } from "./-consent-card.js";
import { authorizeUrl } from "./-authorize-url.js";
import { ConsentCard } from "./-consent-card.js";
import { isHttpUrl } from "./-http-url.js";

const param = v.optional(v.pipe(v.string(), v.maxLength(2048)));

/**
 * The OAuth authorization request (RFC 6749 §4.1.1) `/_plumix/oauth/authorize`
 * sent the person here with, passed back to the server unchanged.
 */
const authorizeSearchSchema = v.object({
  response_type: param,
  client_id: param,
  redirect_uri: param,
  scope: param,
  state: param,
  code_challenge: param,
  code_challenge_method: param,
  resource: param,
});

export const Route = createFileRoute("/_authenticated/auth/authorize")({
  validateSearch: authorizeSearchSchema,
  component: AuthorizeRoute,
});

function AuthorizeRoute(): ReactNode {
  const request = Route.useSearch();
  const lookup = useQuery({
    ...orpc.auth.oauthConsent.lookup.queryOptions({ input: request }),
    retry: false,
  });
  const covered = lookup.data?.covered === true;

  // Someone who signed in on the way here may already hold a grant that covers
  // the request; `/authorize` then answers the client without asking again.
  useEffect(() => {
    if (covered)
      window.location.replace(authorizeUrl(adminBasePath(), request));
  }, [covered, request]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1
          className="text-2xl font-semibold"
          data-testid="oauth-consent-heading"
        >
          <Trans id="auth.authorize.title" message="Connect an app" />
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans
            id="auth.authorize.description"
            message="An app wants to work on this site as you. It gets only what you approve, and never more than you can do."
          />
        </p>
      </header>

      {lookup.isError ? (
        <Alert variant="destructive" data-testid="oauth-consent-invalid">
          <AlertDescription>
            <Trans
              id="auth.authorize.invalid"
              message="This connection request isn't valid. Start connecting again from the app."
            />
          </AlertDescription>
        </Alert>
      ) : null}

      {lookup.data && !covered ? (
        <Consent
          request={request}
          client={lookup.data.client}
          scope={lookup.data.scope}
          capabilities={lookup.data.capabilities}
        />
      ) : null}
    </div>
  );
}

function Consent({
  request,
  client,
  scope,
  capabilities,
}: {
  readonly request: v.InferOutput<typeof authorizeSearchSchema>;
  readonly client: ConsentClient;
  readonly scope: ConsentScope;
  readonly capabilities: readonly string[];
}): ReactNode {
  const [kept, setKept] = useState<ReadonlySet<string>>(
    () => new Set(capabilities),
  );

  // Both answers end at the client: the server built the URL from the
  // client's verified redirect URI.
  const leave = ({ redirectTo }: { redirectTo: string }): void => {
    if (isHttpUrl(redirectTo)) window.location.assign(redirectTo);
  };
  const approve = useMutation({
    mutationFn: () =>
      orpc.auth.oauthConsent.approve.call({
        ...request,
        capabilities: capabilities.filter((capability) => kept.has(capability)),
      }),
    onSuccess: leave,
  });
  const deny = useMutation({
    mutationFn: () => orpc.auth.oauthConsent.deny.call(request),
    onSuccess: leave,
  });

  return (
    <ConsentCard
      client={client}
      scope={scope}
      capabilities={capabilities}
      kept={kept}
      pending={approve.isPending || deny.isPending}
      failed={approve.isError || deny.isError}
      onToggle={(capability, keep) => {
        setKept((current) => {
          const next = new Set(current);
          if (keep) next.add(capability);
          else next.delete(capability);
          return next;
        });
      }}
      onApprove={() => approve.mutate()}
      onDeny={() => deny.mutate()}
    />
  );
}
