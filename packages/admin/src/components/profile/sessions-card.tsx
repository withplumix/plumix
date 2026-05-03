import type { ReactNode } from "react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { formatRelative, toDate } from "@/lib/dates.js";
import { extractCode, extractReason } from "@/lib/orpc-errors.js";
import { orpc } from "@/lib/orpc.js";
import { parseUserAgent } from "@/lib/user-agent.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface SessionWire {
  readonly id: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date | string;
  readonly expiresAt: Date | string;
  readonly current: boolean;
}

export function SessionsCard(): ReactNode {
  const queryClient = useQueryClient();
  const [revokeAllFeedback, setRevokeAllFeedback] = useState<
    { kind: "ok"; revoked: number } | { kind: "error"; message: string } | null
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
        message:
          err instanceof Error
            ? err.message
            : "Couldn't revoke sessions. Try again.",
      });
    },
  });

  const sessions = list.data ?? [];
  const otherCount = sessions.filter((s) => !s.current).length;

  return (
    <Card data-testid="profile-sessions-card">
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>
          Devices signed in to this account. Revoke any you don't recognise, or
          sign out everywhere except this browser if you suspect a leak.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {renderSessionsBody(list, sessions, invalidateList)}

        {revokeAllFeedback?.kind === "ok" ? (
          <Alert data-testid="profile-sessions-revoke-feedback">
            <AlertDescription>
              {formatRevokedCount(revokeAllFeedback.revoked)}
            </AlertDescription>
          </Alert>
        ) : null}
        {revokeAllFeedback?.kind === "error" ? (
          <Alert variant="destructive" data-testid="profile-sessions-error">
            <AlertDescription>{revokeAllFeedback.message}</AlertDescription>
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
              {revokeOthers.isPending
                ? "Signing out…"
                : "Sign out other devices"}
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
  const [error, setError] = useState<string | null>(null);
  const ua = parseUserAgent(session.userAgent);
  const Icon = ua.icon;
  const createdAt = toDate(session.createdAt);

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
            {ua.label}
          </span>
          {session.current ? (
            <Badge variant="secondary">This device</Badge>
          ) : null}
        </div>
        <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
          {session.ipAddress ? <span>{session.ipAddress}</span> : null}
          <span>Signed in {formatRelative(createdAt)}</span>
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
          Revoke
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
            <AlertDialogTitle>Sign out this device?</AlertDialogTitle>
            <AlertDialogDescription>
              {ua.label} signed in {formatRelative(createdAt)}
              {session.ipAddress ? ` from ${session.ipAddress}` : ""}. The
              device will need to sign in again next time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <Alert
              variant="destructive"
              data-testid="profile-session-revoke-error"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="profile-session-revoke-confirm"
              disabled={revoke.isPending}
              onClick={(e) => {
                e.preventDefault();
                revoke.mutate();
              }}
            >
              {revoke.isPending ? "Signing out…" : "Sign out device"}
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
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (list.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Couldn't load your sessions. Refresh and try again.
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
        No plumix-managed sessions. Your sign-in is handled by an external
        identity provider.
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

function formatRevokedCount(revoked: number): string {
  if (revoked === 0) return "No other sessions to sign out.";
  if (revoked === 1) return "Signed out 1 other session.";
  return `Signed out ${revoked} other sessions.`;
}

function formatRevokeError(err: unknown): string {
  if (extractReason(err) === "current_session") {
    return "You can't revoke the session you're using right now.";
  }
  if (extractCode(err) === "NOT_FOUND") {
    return "This session no longer exists. Refresh the list.";
  }
  if (err instanceof Error) return err.message;
  return "Couldn't revoke the session. Try again.";
}
