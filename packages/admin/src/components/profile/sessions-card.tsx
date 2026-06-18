import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { toDate } from "@/lib/dates.js";
import { extractCode, extractReason } from "@/lib/orpc-errors.js";
import { orpc } from "@/lib/orpc.js";
import { useFormatters } from "@/lib/use-formatters.js";
import { useLabel } from "@/lib/use-label.js";
import { parseUserAgent } from "@/lib/user-agent.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Label } from "@plumix/core/i18n";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plumix/admin-ui/card";

const M = {
  unknownDevice: defineMessage({
    id: "profile.sessions.unknownDevice",
    message: "Unknown device",
  }),
  // Compact "{browser} on {os}" — vendor names interpolate verbatim,
  // the connector word is localizable.
  browserOnOs: defineMessage({
    id: "profile.sessions.device.browserOnOs",
    message: "{browser} on {os}",
    comment:
      "browser: e.g. 'Safari', 'Chrome'; os: e.g. 'macOS', 'Windows 11'. Vendor names interpolate verbatim; the connector word is localizable.",
  }),
  // Mutation error fallbacks.
  revokeAllFallback: defineMessage({
    id: "profile.sessions.revokeAll.fallback",
    message: "Couldn't revoke sessions. Try again.",
  }),
  revokeCurrent: defineMessage({
    id: "profile.sessions.revoke.current",
    message: "You can't revoke the session you're using right now.",
  }),
  revokeNotFound: defineMessage({
    id: "profile.sessions.revoke.notFound",
    message: "This session no longer exists. Refresh the list.",
  }),
  revokeFallback: defineMessage({
    id: "profile.sessions.revoke.fallback",
    message: "Couldn't revoke the session. Try again.",
  }),
} satisfies Record<string, MessageDescriptor>;

interface SessionWire {
  readonly id: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date | string;
  readonly expiresAt: Date | string;
  readonly current: boolean;
}

export function SessionsCard(): ReactNode {
  const label = useLabel();
  const queryClient = useQueryClient();
  const [revokeAllFeedback, setRevokeAllFeedback] = useState<
    { kind: "ok"; revoked: number } | { kind: "error"; message: Label } | null
  >(null);

  const list = useQuery(orpc.auth.sessions.list.queryOptions({ input: {} }));

  const invalidateList = (): Promise<void> =>
    queryClient.invalidateQueries({
      queryKey: orpc.auth.sessions.list.key(),
    });

  const revokeOthers = useMutation({
    mutationFn: () => orpc.auth.sessions.revokeOthers.call({}),
    onMutate: () => {
      setRevokeAllFeedback(null);
    },
    onSuccess: async (result) => {
      setRevokeAllFeedback({ kind: "ok", revoked: result.revoked });
      await invalidateList();
    },
    onError: (err) => {
      setRevokeAllFeedback({
        kind: "error",
        message: err instanceof Error ? err.message : M.revokeAllFallback,
      });
    },
  });

  const sessions = list.data ?? [];
  const otherCount = sessions.filter((s) => !s.current).length;

  return (
    <Card data-testid="profile-sessions-card">
      <CardHeader>
        <CardTitle>
          <Trans id="profile.sessions.title" message="Active sessions" />
        </CardTitle>
        <CardDescription>
          <Trans
            id="profile.sessions.description"
            message="Devices signed in to this account. Revoke any you don't recognise, or sign out everywhere except this browser if you suspect a leak."
          />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {renderSessionsBody(list, sessions, invalidateList)}

        {revokeAllFeedback?.kind === "ok" ? (
          <Alert data-testid="profile-sessions-revoke-feedback">
            <AlertDescription>
              <Trans
                id="profile.sessions.revokeAll.count"
                message="{revoked, plural, =0 {No other sessions to sign out.} one {Signed out # other session.} other {Signed out # other sessions.}}"
                values={{ revoked: revokeAllFeedback.revoked }}
                comment="revoked: number of OTHER sessions just signed out (excluding the current device)"
              />
            </AlertDescription>
          </Alert>
        ) : null}
        {revokeAllFeedback?.kind === "error" ? (
          <Alert variant="destructive" data-testid="profile-sessions-error">
            <AlertDescription>
              {label(revokeAllFeedback.message)}
            </AlertDescription>
          </Alert>
        ) : null}

        {otherCount > 0 ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                revokeOthers.mutate();
              }}
              disabled={revokeOthers.isPending}
              data-testid="profile-sessions-revoke-button"
            >
              {revokeOthers.isPending ? (
                <Trans
                  id="profile.sessions.revokeAll.pending"
                  message="Signing out…"
                />
              ) : (
                <Trans
                  id="profile.sessions.revokeAll.idle"
                  message="Sign out other devices"
                />
              )}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface SessionRowProps {
  readonly session: SessionWire;
  readonly onChanged: () => Promise<void> | void;
}

function SessionRow({ session, onChanged }: SessionRowProps): ReactNode {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<Label | null>(null);
  const ua = parseUserAgent(session.userAgent);
  const Icon = ua.icon;
  const createdAt = toDate(session.createdAt);
  const { formatRelative } = useFormatters();
  const label = useLabel();
  const deviceLabel = useDeviceLabel(ua);

  const revoke = useMutation({
    mutationFn: () => orpc.auth.sessions.revoke.call({ id: session.id }),
    onMutate: () => {
      setError(null);
    },
    onSuccess: async () => {
      setConfirming(false);
      await onChanged();
    },
    onError: (err) => {
      setError(formatRevokeError(err));
    },
  });

  return (
    <li
      className="flex items-start gap-3 py-3"
      data-testid="profile-session-row"
    >
      <Icon
        aria-hidden
        className="text-muted-foreground mt-0.5 size-5 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-sm font-medium"
            data-testid="profile-session-label"
          >
            {deviceLabel}
          </span>
          {session.current ? (
            <Badge variant="secondary">
              <Trans id="profile.sessions.thisDevice" message="This device" />
            </Badge>
          ) : null}
        </div>
        <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
          {session.ipAddress ? <span>{session.ipAddress}</span> : null}
          <span>
            <Trans
              id="profile.sessions.signedIn"
              message="Signed in {when}"
              values={{ when: formatRelative(createdAt) }}
              comment="when: pre-formatted relative-time string like '2 hours ago'"
            />
          </span>
        </div>
      </div>
      {!session.current ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive shrink-0"
          onClick={() => {
            setConfirming(true);
          }}
          data-testid="profile-session-revoke-button"
        >
          <Trans id="profile.sessions.revoke.button" message="Revoke" />
        </Button>
      ) : null}

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(false);
            setError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans
                id="profile.sessions.revoke.title"
                message="Sign out this device?"
              />
            </AlertDialogTitle>
            <AlertDialogDescription>
              {session.ipAddress ? (
                <Trans
                  id="profile.sessions.revoke.descriptionWithIp"
                  message="{device} signed in {when} from {ip}. The device will need to sign in again next time."
                  values={{
                    device: <bdi>{deviceLabel}</bdi>,
                    when: formatRelative(createdAt),
                    ip: session.ipAddress,
                  }}
                  comment="device: 'Safari on macOS' style label; when: relative-time string; ip: IPv4/IPv6 address"
                />
              ) : (
                <Trans
                  id="profile.sessions.revoke.description"
                  message="{device} signed in {when}. The device will need to sign in again next time."
                  values={{
                    device: <bdi>{deviceLabel}</bdi>,
                    when: formatRelative(createdAt),
                  }}
                  comment="device: 'Safari on macOS' style label; when: relative-time string"
                />
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <Alert
              variant="destructive"
              data-testid="profile-session-revoke-error"
            >
              <AlertDescription>{label(error)}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>
              <Trans id="profile.sessions.revoke.cancel" message="Cancel" />
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="profile-session-revoke-confirm"
              disabled={revoke.isPending}
              onClick={(e) => {
                e.preventDefault();
                revoke.mutate();
              }}
            >
              {revoke.isPending ? (
                <Trans
                  id="profile.sessions.revoke.pending"
                  message="Signing out…"
                />
              ) : (
                <Trans
                  id="profile.sessions.revoke.confirm"
                  message="Sign out device"
                />
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

// Pending → error → empty → list. Promoted to a helper because the
// inline JSX nesting is the kind of nested-ternary the project rule
// flags; one early-return chain is easier to scan.
function renderSessionsBody(
  list: ReturnType<typeof useQuery<readonly SessionWire[]>>,
  sessions: readonly SessionWire[],
  invalidateList: () => Promise<void>,
): ReactNode {
  if (list.isPending) {
    return (
      <p className="text-muted-foreground text-sm">
        <Trans id="profile.sessions.loading" message="Loading…" />
      </p>
    );
  }
  if (list.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <Trans
            id="profile.sessions.loadFailed"
            message="Couldn't load your sessions. Refresh and try again."
          />
        </AlertDescription>
      </Alert>
    );
  }
  if (sessions.length === 0) {
    // External authenticators (cfAccess) don't mint plumix session
    // rows; the IdP owns that. Surface explicitly so the operator
    // doesn't think the page is broken.
    return (
      <p className="text-muted-foreground text-sm">
        <Trans
          id="profile.sessions.empty"
          message="No plumix-managed sessions. Your sign-in is handled by an external identity provider."
        />
      </p>
    );
  }
  return (
    <ul className="divide-border divide-y" data-testid="profile-sessions-list">
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          onChanged={invalidateList}
        />
      ))}
    </ul>
  );
}

// Picks the right "{browser} on {os}" / "{browser}" / "{os}" / fallback
// message for the parsed UA. Browser + OS vendor names stay verbatim;
// only the connector ("on") and the unknown-device fallback get
// localized.
function useDeviceLabel(ua: ReturnType<typeof parseUserAgent>): string {
  const { i18n } = useLingui();
  const label = useLabel();
  if (ua.browser && ua.os) {
    return i18n._(
      M.browserOnOs.id,
      { browser: ua.browser, os: ua.os },
      { message: M.browserOnOs.message },
    );
  }
  if (ua.browser) return ua.browser;
  if (ua.os) return ua.os;
  return label(M.unknownDevice);
}

function formatRevokeError(err: unknown): Label {
  if (extractReason(err) === "current_session") return M.revokeCurrent;
  if (extractCode(err) === "NOT_FOUND") return M.revokeNotFound;
  if (err instanceof Error) return err.message;
  return M.revokeFallback;
}
