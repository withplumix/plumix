import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { toDate } from "@/lib/dates.js";
import { orpc } from "@/lib/orpc.js";
import { useFormatters } from "@/lib/use-formatters.js";
import { useLabel } from "@/lib/use-label.js";
import { Trans } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription } from "@plumix/admin-ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@plumix/admin-ui/alert-dialog";
import { Badge } from "@plumix/admin-ui/badge";
import { Button } from "@plumix/admin-ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@plumix/admin-ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@plumix/admin-ui/table";

import { revokeApiTokenErrorDescriptor } from "./profile-errors.js";

interface ConnectedApp {
  readonly id: number;
  readonly name: string;
  readonly host: string;
  readonly capabilities: readonly string[];
  readonly lastUsedAt: Date | string | null;
}

interface RevokeCallbacks {
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}

export function SelfConnectedApps(): ReactNode {
  const queryClient = useQueryClient();
  const list = useQuery(orpc.auth.oauthGrants.list.queryOptions({ input: {} }));
  const revoke = useMutation({
    mutationFn: (id: number) => orpc.auth.oauthGrants.revoke.call({ id }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.auth.oauthGrants.list.key(),
      }),
  });

  return (
    <ConnectedAppsSection
      apps={list.data ?? []}
      isLoading={list.isLoading}
      onRevoke={(id, cbs) => revoke.mutate(id, cbs)}
      revokePending={revoke.isPending}
    />
  );
}

export function AdminConnectedApps({ userId }: { userId: number }): ReactNode {
  const queryClient = useQueryClient();
  const list = useQuery(
    orpc.auth.oauthGrants.adminList.queryOptions({ input: { userId } }),
  );
  const revoke = useMutation({
    mutationFn: (id: number) =>
      orpc.auth.oauthGrants.adminRevoke.call({ userId, id }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.auth.oauthGrants.adminList.key(),
      }),
  });

  return (
    <ConnectedAppsSection
      apps={list.data ?? []}
      isLoading={list.isLoading}
      onRevoke={(id, cbs) => revoke.mutate(id, cbs)}
      revokePending={revoke.isPending}
    />
  );
}

export function ConnectedAppsSection({
  apps,
  isLoading,
  onRevoke,
  revokePending,
}: {
  apps: readonly ConnectedApp[];
  isLoading: boolean;
  onRevoke: (id: number, callbacks?: RevokeCallbacks) => void;
  revokePending: boolean;
}): ReactNode {
  const label = useLabel();
  const [revokeTarget, setRevokeTarget] = useState<ConnectedApp | null>(null);
  const [revokeError, setRevokeError] = useState<MessageDescriptor | null>(
    null,
  );

  // Hoisted: lingui/no-expression-in-message rejects member exprs inline.
  const bdiRevokeName = <bdi>{revokeTarget?.name ?? ""}</bdi>;

  return (
    <section
      className="flex flex-col gap-3 border-t pt-6"
      data-testid="connected-apps"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">
          <Trans id="connectedApps.title" message="Connected apps" />
        </h3>
        <p className="text-muted-foreground text-sm">
          <Trans
            id="connectedApps.description"
            message="Agents connected through OAuth. Revoking one disconnects it at once, and it must ask for approval to connect again."
          />
        </p>
      </div>

      {isLoading ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid="connected-apps-loading"
        >
          <Trans id="connectedApps.loading" message="Loading apps…" />
        </p>
      ) : apps.length === 0 ? (
        <Empty data-testid="connected-apps-empty">
          <EmptyHeader>
            <EmptyTitle>
              <Trans
                id="connectedApps.empty.title"
                message="No connected apps"
              />
            </EmptyTitle>
            <EmptyDescription>
              <Trans
                id="connectedApps.empty.description"
                message="An agent that connects through OAuth shows up here."
              />
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table data-testid="connected-apps-table">
          <TableHeader>
            <TableRow>
              <TableHead>
                <Trans id="connectedApps.col.app" message="App" />
              </TableHead>
              <TableHead>
                <Trans id="connectedApps.col.access" message="Access" />
              </TableHead>
              <TableHead>
                <Trans id="connectedApps.col.lastUsed" message="Last used" />
              </TableHead>
              <TableHead className="w-px text-end">
                <Trans id="connectedApps.col.actions" message="Actions" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apps.map((app) => (
              <TableRow
                key={app.id}
                data-testid={`connected-apps-row-${app.id}`}
              >
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{app.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {app.host}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <CapabilityBadges capabilities={app.capabilities} />
                </TableCell>
                <TableCell
                  variant="muted"
                  data-testid={`connected-apps-last-used-${app.id}`}
                >
                  <LastUsed when={app.lastUsedAt} />
                </TableCell>
                <TableCell className="text-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevokeTarget(app)}
                    data-testid={`connected-apps-revoke-${app.id}`}
                  >
                    <Trans id="connectedApps.revoke.button" message="Revoke" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeTarget(null);
            setRevokeError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans
                id="connectedApps.revoke.title"
                message='Revoke "{name}"?'
                values={{ name: bdiRevokeName }}
                comment="name: the connected app's name, from its OAuth client metadata (e.g. 'Claude')"
              />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                id="connectedApps.revoke.description"
                message="The app is disconnected immediately. Its next connection asks for approval again."
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revokeError ? (
            <Alert
              variant="destructive"
              data-testid="connected-apps-revoke-error"
            >
              <AlertDescription>{label(revokeError)}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokePending}>
              <Trans id="connectedApps.revoke.cancel" message="Cancel" />
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="connected-apps-revoke-confirm-button"
              disabled={revokePending}
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                if (!revokeTarget) return;
                setRevokeError(null);
                onRevoke(revokeTarget.id, {
                  onSuccess: () => setRevokeTarget(null),
                  onError: (err) => {
                    setRevokeError(revokeApiTokenErrorDescriptor(err));
                  },
                });
              }}
            >
              {revokePending ? (
                <Trans id="connectedApps.revoke.pending" message="Revoking…" />
              ) : (
                <Trans id="connectedApps.revoke.confirm" message="Revoke" />
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function LastUsed({ when }: { when: Date | string | null }): ReactNode {
  const { formatRelative } = useFormatters();
  if (when === null) return <Trans id="connectedApps.never" message="Never" />;
  return <>{formatRelative(toDate(when))}</>;
}

function CapabilityBadges({
  capabilities,
}: {
  capabilities: readonly string[];
}): ReactNode {
  if (capabilities.length === 0) {
    return (
      <Badge variant="outline" data-testid="connected-apps-capability-none">
        <Trans id="connectedApps.access.none" message="No access" />
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {capabilities.map((capability) => (
        <Badge
          key={capability}
          variant="secondary"
          data-testid={`connected-apps-capability-${capability}`}
        >
          {capability}
        </Badge>
      ))}
    </div>
  );
}
