import type { ReactNode } from "react";
import { Trans } from "@lingui/react";

import { Alert, AlertDescription } from "@plumix/admin-ui/alert";
import { Button } from "@plumix/admin-ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plumix/admin-ui/card";
import { Checkbox } from "@plumix/admin-ui/checkbox";
import { Label as UILabel } from "@plumix/admin-ui/label";

export interface ConsentClient {
  readonly name: string;
  readonly host: string;
  readonly logoUri: string | null;
  readonly loopbackOnly: boolean;
}

export type ConsentScope = "read" | "draft" | "full";

function ScopeName({ scope }: { readonly scope: ConsentScope }): ReactNode {
  switch (scope) {
    case "read":
      return <Trans id="auth.authorize.scope.read" message="Read only" />;
    case "draft":
      return (
        <Trans id="auth.authorize.scope.draft" message="Draft, can't publish" />
      );
    case "full":
      return <Trans id="auth.authorize.scope.full" message="Same as me" />;
  }
}

/**
 * What an OAuth client asks for, shaped like device approval: the person keeps
 * any part of the requested scope and approves only that.
 */
export function ConsentCard({
  client,
  scope,
  capabilities,
  kept,
  pending,
  failed,
  onToggle,
  onApprove,
  onDeny,
}: {
  readonly client: ConsentClient;
  readonly scope: ConsentScope;
  readonly capabilities: readonly string[];
  readonly kept: ReadonlySet<string>;
  readonly pending: boolean;
  readonly failed: boolean;
  readonly onToggle: (capability: string, keep: boolean) => void;
  readonly onApprove: () => void;
  readonly onDeny: () => void;
}): ReactNode {
  // The document is the client's own; anything but https would be mixed content.
  const logo = client.logoUri?.startsWith("https:") ? client.logoUri : null;
  return (
    <Card data-testid="oauth-consent-card">
      <CardHeader>
        <div className="flex items-center gap-3">
          {logo === null ? null : (
            <img src={logo} alt="" className="size-10 rounded-md" />
          )}
          <div className="flex flex-col gap-1">
            <CardTitle data-testid="oauth-consent-client-name">
              {client.name}
            </CardTitle>
            <CardDescription data-testid="oauth-consent-client-host">
              {client.host}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {client.loopbackOnly ? (
          <Alert data-testid="oauth-consent-loopback-warning">
            <AlertDescription>
              <Trans
                id="auth.authorize.loopbackWarning"
                message="This app only sends you back to an address on your own computer. Approve it only if you started connecting it yourself."
              />
            </AlertDescription>
          </Alert>
        ) : null}

        <p className="text-sm">
          <Trans
            id="auth.authorize.scope.label"
            message="It asks for: <0/>. Untick anything it shouldn't do."
            components={{ 0: <ScopeName scope={scope} /> }}
          />
        </p>

        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {capabilities.map((capability) => {
            const id = `oauth-consent-capability-${capability}`;
            return (
              <li key={capability} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  data-testid={id}
                  checked={kept.has(capability)}
                  disabled={pending}
                  onCheckedChange={(checked) =>
                    onToggle(capability, checked === true)
                  }
                />
                <UILabel htmlFor={id} variant="choice">
                  <code className="font-mono text-xs">{capability}</code>
                </UILabel>
              </li>
            );
          })}
        </ul>

        {failed ? (
          <Alert variant="destructive" data-testid="oauth-consent-error">
            <AlertDescription>
              <Trans
                id="auth.authorize.error"
                message="Couldn't complete the request. Try again."
              />
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onDeny}
            data-testid="oauth-consent-deny-button"
          >
            <Trans id="auth.authorize.deny" message="Deny" />
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={onApprove}
            data-testid="oauth-consent-approve-button"
          >
            <Trans id="auth.authorize.approve" message="Approve" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
