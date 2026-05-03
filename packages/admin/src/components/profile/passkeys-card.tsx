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
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { toDate } from "@/lib/dates.js";
import { extractCode, extractReason } from "@/lib/orpc-errors.js";
import { orpc } from "@/lib/orpc.js";
import { PasskeyError } from "@/lib/passkey-errors.js";
import { registerWithPasskey } from "@/lib/passkey.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Wire shape from `auth.credentials.list`. Mirrors the columns the RPC
// handler picks — keep in sync if the projection there changes. Dates
// arrive as ISO strings or Date depending on cache state, so the
// display sites coerce via `toDate`.
interface PasskeyWire {
  readonly id: string;
  readonly name: string | null;
  readonly isBackedUp: boolean;
  readonly transports: readonly string[] | null;
  readonly createdAt: Date | string;
  readonly lastUsedAt: Date | string;
}

interface PasskeysCardProps {
  /**
   * The viewer's email — required by `registerWithPasskey` for the
   * add-device WebAuthn challenge. The server enforces
   * `authed.email === input.email` so passing `target.email` from a
   * self-edit screen is the contract.
   */
  readonly userEmail: string;
}

export function PasskeysCard({ userEmail }: PasskeysCardProps): ReactNode {
  const queryClient = useQueryClient();
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const list = useQuery(orpc.auth.credentials.list.queryOptions({ input: {} }));

  const invalidateList = (): Promise<void> =>
    queryClient.invalidateQueries({
      queryKey: orpc.auth.credentials.list.key(),
    });

  const enroll = useMutation({
    mutationFn: () => registerWithPasskey({ email: userEmail }),
    onMutate: () => {
      setEnrollError(null);
    },
    onSuccess: () => invalidateList(),
    onError: (err) => {
      setEnrollError(formatPasskeyEnrollError(err));
    },
  });

  return (
    <Card data-testid="profile-passkeys-card">
      <CardHeader>
        <CardTitle>Passkeys</CardTitle>
        <CardDescription>
          Devices that can sign in to this account. Add a new one before
          deleting an old one — at least one passkey must remain.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {list.isPending ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : list.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Couldn't load your passkeys. Refresh and try again.
            </AlertDescription>
          </Alert>
        ) : list.data.length > 0 ? (
          <ul
            className="divide-border divide-y"
            data-testid="profile-passkeys-list"
          >
            {list.data.map((cred) => (
              <PasskeyRow
                key={cred.id}
                cred={cred}
                isLast={list.data.length === 1}
                onChanged={invalidateList}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            No passkeys registered. Add one to enable sign-in.
          </p>
        )}

        {enrollError ? (
          <Alert
            variant="destructive"
            data-testid="profile-passkeys-enroll-error"
          >
            <AlertDescription>{enrollError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              enroll.mutate();
            }}
            disabled={enroll.isPending}
            data-testid="profile-passkeys-enroll-button"
          >
            {enroll.isPending ? "Adding…" : "Add passkey"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface PasskeyRowProps {
  readonly cred: PasskeyWire;
  readonly isLast: boolean;
  readonly onChanged: () => Promise<void> | void;
}

function PasskeyRow({ cred, isLast, onChanged }: PasskeyRowProps): ReactNode {
  const createdAt = toDate(cred.createdAt);
  const lastUsedAt = toDate(cred.lastUsedAt);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cred.name ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const rename = useMutation({
    mutationFn: (name: string) =>
      orpc.auth.credentials.rename.call({ id: cred.id, name }),
    onMutate: () => {
      setRenameError(null);
    },
    onSuccess: async () => {
      setEditing(false);
      await onChanged();
    },
    onError: (err) => {
      setRenameError(formatRenameError(err));
    },
  });

  const remove = useMutation({
    mutationFn: () => orpc.auth.credentials.delete.call({ id: cred.id }),
    onMutate: () => {
      setDeleteError(null);
    },
    onSuccess: async () => {
      setConfirmingDelete(false);
      await onChanged();
    },
    onError: (err) => {
      setDeleteError(formatDeleteError(err));
    },
  });

  const displayName = cred.name ?? "Unnamed passkey";
  const transportLabel = formatTransport(cred);

  return (
    <li className="flex flex-col gap-2 py-3" data-testid="profile-passkey-row">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {editing ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = draft.trim();
                if (trimmed.length === 0) {
                  setRenameError("Name can't be empty.");
                  return;
                }
                rename.mutate(trimmed);
              }}
            >
              <Label
                htmlFor={`passkey-name-${cred.id}`}
                className="text-muted-foreground text-xs"
              >
                Rename passkey
              </Label>
              <Input
                id={`passkey-name-${cred.id}`}
                value={draft}
                maxLength={64}
                onChange={(e) => {
                  setDraft(e.target.value);
                }}
                data-testid="profile-passkey-rename-input"
                autoFocus
              />
              {renameError ? (
                <Alert
                  variant="destructive"
                  data-testid="profile-passkey-rename-error"
                >
                  <AlertDescription>{renameError}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setDraft(cred.name ?? "");
                    setRenameError(null);
                  }}
                  disabled={rename.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={rename.isPending}
                  data-testid="profile-passkey-rename-submit"
                >
                  {rename.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <p
                className="text-sm font-medium"
                data-testid="profile-passkey-name"
              >
                {displayName}
              </p>
              <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                {transportLabel ? <span>{transportLabel}</span> : null}
                {cred.isBackedUp ? (
                  <Badge variant="secondary">Synced</Badge>
                ) : null}
                <span>Added {formatDate(createdAt)}</span>
                {lastUsedAt.getTime() !== createdAt.getTime() ? (
                  <span>Last used {formatDate(lastUsedAt)}</span>
                ) : null}
              </div>
            </>
          )}
        </div>
        {!editing ? (
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(true);
                setDraft(cred.name ?? "");
              }}
              data-testid="profile-passkey-rename-button"
            >
              Rename
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setConfirmingDelete(true);
              }}
              disabled={isLast}
              title={
                isLast
                  ? "You can't delete your last passkey. Add another one first."
                  : undefined
              }
              data-testid="profile-passkey-delete-button"
            >
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      <AlertDialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmingDelete(false);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              The device that registered &quot;{displayName}&quot; will no
              longer be able to sign in. You can re-enrol it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <Alert
              variant="destructive"
              data-testid="profile-passkey-delete-error"
            >
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="profile-passkey-delete-confirm"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete passkey"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

// Server returns ISO strings for timestamps; date-format helper centralises
// the consistent short form across this card.
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTransport(cred: PasskeyWire): string | null {
  const transports = cred.transports;
  if (!transports || transports.length === 0) return null;
  // Map WebAuthn transport tokens to readable copy. "internal" = platform
  // authenticator (Touch ID / Windows Hello); "hybrid" = QR-paired phone
  // ceremony; everything else (`usb`, `nfc`, `ble`) is some flavour of
  // hardware security key — collapse to one bucket rather than expose
  // raw transport tokens to end users.
  if (transports.includes("internal")) return "This device";
  if (transports.includes("hybrid")) return "Cross-device";
  return "Security key";
}

function formatRenameError(err: unknown): string {
  if (extractCode(err) === "NOT_FOUND") {
    return "This passkey no longer exists. Refresh the list.";
  }
  if (err instanceof Error) return err.message;
  return "Couldn't rename the passkey. Try again.";
}

function formatDeleteError(err: unknown): string {
  if (extractReason(err) === "last_credential") {
    return "You can't delete your last passkey. Add another one first.";
  }
  if (extractCode(err) === "NOT_FOUND") {
    return "This passkey no longer exists. Refresh the list.";
  }
  if (err instanceof Error) return err.message;
  return "Couldn't delete the passkey. Try again.";
}

// Surface-specific copy for `registerWithPasskey` failures during add-
// device. Mirrors the login screen's PasskeyError → friendly-message
// table but tuned to the "you're already signed in, adding a device"
// flow (no `registration_closed` because authed users always pass that
// check).
function formatPasskeyEnrollError(err: unknown): string {
  if (err instanceof PasskeyError) {
    switch (err.code) {
      case "user_cancelled":
        return "Cancelled. Tap Add passkey when you're ready.";
      case "credential_already_registered":
        return "That passkey is already registered on this account.";
      case "no_authenticator":
        return "This device doesn't support passkeys.";
      case "network_error":
        return "Network error. Check your connection and try again.";
      case "email_mismatch":
        return "Couldn't enrol — re-sign-in and try again.";
    }
    // Unknown PasskeyError code → fall through to err.message below for
    // a slightly more informative message than a generic fallback.
  }
  if (err instanceof Error) return err.message;
  return "Couldn't enrol the passkey. Try again.";
}
