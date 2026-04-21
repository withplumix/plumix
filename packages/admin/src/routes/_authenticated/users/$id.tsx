import type { ReactNode } from "react";
import { useState } from "react";
import { FormField } from "@/components/form/field.js";
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
import { Label } from "@/components/ui/label.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { hasCap } from "@/lib/caps.js";
import { orpc } from "@/lib/orpc.js";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import * as v from "valibot";

import type { User, UserRole } from "@plumix/core/schema";

import {
  isUserRole,
  USER_ROLES,
  USERS_LIST_DEFAULT_SEARCH,
} from "./-constants.js";

// Long-form labels for the role dropdown — same rationale as the invite
// form (the picker benefits from affordance copy, unlike the list view's
// compact badges).
const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrator — full control",
  editor: "Editor — publish + edit any post",
  author: "Author — publish own posts",
  contributor: "Contributor — draft, no publish",
  subscriber: "Subscriber — read only",
};

const profileFormSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.maxLength(100)),
  role: v.picklist(USER_ROLES),
});

export const Route = createFileRoute("/_authenticated/users/$id")({
  parseParams: (params) => ({ id: Number(params.id) }),
  // More permissive than `/users/` — a user without `user:list` can
  // still edit their OWN row, so this screen doubles as `/profile`
  // (which redirects here). Other-user edits require `user:list`; the
  // server's own `user:edit_own` / `user:edit` checks are the final
  // word, but surfacing the right screen is half the UX.
  beforeLoad: ({ context, params }) => {
    const id = Number(params.id);
    if (Number.isNaN(id) || id < 1) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/users", search: USERS_LIST_DEFAULT_SEARCH });
    }
    const isSelf = id === context.user.id;
    const canEditAny = hasCap(context.user.capabilities, "user:list");
    const canEditSelf =
      isSelf && hasCap(context.user.capabilities, "user:edit_own");
    if (!canEditAny && !canEditSelf) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/" });
    }
  },
  component: UserEditRoute,
});

function UserEditRoute(): ReactNode {
  const { id } = Route.useParams();
  const { user: session } = Route.useRouteContext();
  const userId = Number(id);
  const isSelf = userId === session.id;
  // `user:promote` is admin-only. Self can't promote self even with the
  // cap (mirrors WP) — the role dropdown is hidden in the self case.
  const canPromote = hasCap(session.capabilities, "user:promote") && !isSelf;
  const canDisable = hasCap(session.capabilities, "user:edit") && !isSelf;
  const canDelete = hasCap(session.capabilities, "user:delete") && !isSelf;
  // Match the server's actual write permission, not the more permissive
  // route gate (`user:list` vs `user:edit`). Editors can view the edit
  // screen (via `user:list`) but not save — this disables the Save
  // button and the Name input for them instead of surfacing a generic
  // server 403 after a wasted keystroke.
  const canSave = isSelf
    ? hasCap(session.capabilities, "user:edit_own")
    : hasCap(session.capabilities, "user:edit");

  const query = useQuery(orpc.user.get.queryOptions({ input: { id: userId } }));

  if (query.isPending) {
    return <UserEditSkeleton />;
  }
  if (query.isError) {
    return (
      <NotFoundPlaceholder message="Couldn't load that user. They may have been deleted." />
    );
  }

  const target = query.data;
  return (
    <UserEditForm
      // Remount after each successful save — the server bumps
      // `updatedAt`, the refetch delivers fresh data, and this key
      // flip gets TanStack Form to re-read `defaultValues`. Without
      // it the form keeps displaying pre-save values until the user
      // navigates away. Same pattern as /content/$slug/$id.
      key={
        target.updatedAt instanceof Date
          ? target.updatedAt.toISOString()
          : String(target.updatedAt)
      }
      target={target}
      isSelf={isSelf}
      canPromote={canPromote}
      canSave={canSave}
      canDisable={canDisable}
      canDelete={canDelete}
      onRefetch={() => {
        void query.refetch();
      }}
    />
  );
}

function UserEditForm({
  target,
  isSelf,
  canPromote,
  canSave,
  canDisable,
  canDelete,
  onRefetch,
}: {
  target: User;
  isSelf: boolean;
  canPromote: boolean;
  canSave: boolean;
  canDisable: boolean;
  canDelete: boolean;
  onRefetch: () => void;
}): ReactNode {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const updateUser = useMutation({
    mutationFn: (values: { name: string; role: UserRole }) =>
      orpc.user.update.call({
        id: target.id,
        name: values.name.length > 0 ? values.name : null,
        // Only send role if the caller can change it AND it actually
        // differs — avoids a needless `user:promote` cap check on the
        // server for name-only edits.
        ...(canPromote && values.role !== target.role
          ? { role: values.role }
          : {}),
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: () => {
      onRefetch();
    },
    onError: (err) => {
      setServerError(
        mapUserError(
          err,
          UPDATE_ERROR_MESSAGES,
          "Couldn't save the changes. Try again.",
        ),
      );
    },
  });

  const form = useForm({
    defaultValues: {
      name: target.name ?? "",
      role: target.role,
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(profileFormSchema, value);
        return result.success ? undefined : result.issues[0].message;
      },
    },
    onSubmit: ({ value }) => {
      updateUser.mutate(value);
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        to="/users"
        search={USERS_LIST_DEFAULT_SEARCH}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        data-testid="user-edit-back-link"
      >
        <ArrowLeft className="size-4" />
        Back to users
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>
            <h1 data-testid="user-edit-heading">
              {isSelf ? "Your profile" : `Edit ${target.email}`}
            </h1>
          </CardTitle>
          <CardDescription>
            {isSelf
              ? "Update your display name. Role and account state are managed by administrators."
              : "Update this account's details. Role changes invalidate existing sessions immediately."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label>Email</Label>
              <p
                className="text-muted-foreground font-mono text-sm"
                data-testid="user-edit-email"
              >
                {target.email}
              </p>
              <p className="text-muted-foreground text-xs">
                Email changes aren't supported yet — it's the account key.
              </p>
            </div>

            <form.Field name="name">
              {(field) => (
                <FormField
                  field={field}
                  label={
                    <>
                      Name{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </>
                  }
                  type="text"
                  autoComplete="name"
                  disabled={updateUser.isPending || !canSave}
                  data-testid="user-edit-name-input"
                />
              )}
            </form.Field>

            {canPromote ? (
              <form.Field name="role">
                {(field) => (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="role">Role</Label>
                    <select
                      id="role"
                      name="role"
                      value={field.state.value}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (isUserRole(next)) field.handleChange(next);
                      }}
                      disabled={updateUser.isPending}
                      data-testid="user-edit-role-select"
                      className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {USER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </form.Field>
            ) : (
              <div className="flex flex-col gap-2">
                <Label>Role</Label>
                <Badge variant="secondary" className="w-fit capitalize">
                  {target.role}
                </Badge>
                {isSelf ? (
                  <p className="text-muted-foreground text-xs">
                    Only another administrator can change your role.
                  </p>
                ) : null}
              </div>
            )}

            {serverError ? (
              <Alert variant="destructive" data-testid="user-edit-server-error">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigate({
                    to: "/users",
                    search: USERS_LIST_DEFAULT_SEARCH,
                  });
                }}
                disabled={updateUser.isPending}
              >
                Cancel
              </Button>
              <form.Subscribe selector={(state) => state.canSubmit}>
                {(canSubmit) => (
                  <Button
                    type="submit"
                    disabled={!canSubmit || updateUser.isPending || !canSave}
                    data-testid="user-edit-submit"
                  >
                    {updateUser.isPending ? "Saving…" : "Save changes"}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </form>
        </CardContent>
      </Card>

      {canDisable ? <StatusCard target={target} onChanged={onRefetch} /> : null}
      {canDelete ? (
        <DeleteCard
          target={target}
          isSelf={isSelf}
        /> /* isSelf is always false here since canDelete hides for self, but spelled out for the reader */
      ) : null}
    </div>
  );
}

function StatusCard({
  target,
  onChanged,
}: {
  target: User;
  onChanged: () => void;
}): ReactNode {
  const [serverError, setServerError] = useState<string | null>(null);
  const isDisabled = target.disabledAt != null;

  const toggle = useMutation({
    mutationFn: () =>
      isDisabled
        ? orpc.user.enable.call({ id: target.id })
        : orpc.user.disable.call({ id: target.id }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: () => {
      onChanged();
    },
    onError: (err) => {
      setServerError(
        mapUserError(
          err,
          STATUS_ERROR_MESSAGES,
          "Couldn't change the account status. Try again.",
        ),
      );
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account status</CardTitle>
        <CardDescription>
          {isDisabled
            ? "Disabled accounts can't sign in. Re-enabling restores access; their passkey is still registered."
            : "Disabling signs the user out immediately and blocks future sign-ins. Their posts stay published."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <Badge variant={isDisabled ? "destructive" : "secondary"}>
            {isDisabled ? "Disabled" : "Active"}
          </Badge>
          <Button
            variant={isDisabled ? "default" : "outline"}
            onClick={() => {
              toggle.mutate();
            }}
            disabled={toggle.isPending}
            data-testid={
              isDisabled
                ? "user-edit-enable-button"
                : "user-edit-disable-button"
            }
          >
            {toggle.isPending
              ? isDisabled
                ? "Enabling…"
                : "Disabling…"
              : isDisabled
                ? "Re-enable user"
                : "Disable user"}
          </Button>
        </div>
        {serverError ? (
          <Alert variant="destructive" data-testid="user-status-error">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DeleteCard({ target }: { target: User; isSelf: boolean }): ReactNode {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [reassignTo, setReassignTo] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Everyone except the user being deleted — populates the reassign
  // dropdown. 100-item cap is fine for the single-site MVP; larger
  // deployments will want a typeahead, which we can slot in later by
  // swapping this query for a debounced search list.
  const candidates = useQuery({
    ...orpc.user.list.queryOptions({ input: { limit: 100 } }),
    enabled: confirming,
  });
  const reassignOptions = (candidates.data ?? []).filter(
    (u) => u.id !== target.id,
  );

  const deleteUser = useMutation({
    mutationFn: () =>
      orpc.user.delete.call({
        id: target.id,
        ...(reassignTo != null ? { reassignPostsTo: reassignTo } : {}),
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: () => {
      void navigate({ to: "/users", search: USERS_LIST_DEFAULT_SEARCH });
    },
    onError: (err) => {
      setServerError(
        mapUserError(
          err,
          DELETE_ERROR_MESSAGES,
          "Couldn't delete the user. Try again.",
        ),
      );
    },
  });

  if (!confirming) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Delete user</CardTitle>
          <CardDescription>
            Permanent. Their posts stay, but you'll choose who inherits
            authorship.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => {
              setConfirming(true);
            }}
            data-testid="user-edit-delete-button"
          >
            Delete user
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">
          Confirm delete: {target.email}
        </CardTitle>
        <CardDescription>
          If this user authored any posts, the next step reassigns them. Leave
          "Keep posts as-is" if they have none.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="reassign-to">Reassign posts to</Label>
          <select
            id="reassign-to"
            value={reassignTo == null ? "" : String(reassignTo)}
            onChange={(e) => {
              const raw = e.target.value;
              setReassignTo(raw === "" ? null : Number(raw));
            }}
            disabled={deleteUser.isPending || candidates.isPending}
            data-testid="user-delete-reassign-select"
            className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Keep posts as-is (none to reassign)</option>
            {reassignOptions.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.name ?? u.email} ({u.email})
              </option>
            ))}
          </select>
        </div>

        {serverError ? (
          <Alert variant="destructive" data-testid="user-delete-error">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setConfirming(false);
              setReassignTo(null);
              setServerError(null);
            }}
            disabled={deleteUser.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              deleteUser.mutate();
            }}
            disabled={deleteUser.isPending}
            data-testid="user-delete-confirm-button"
          >
            {deleteUser.isPending ? "Deleting…" : "Delete forever"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// CONFLICT→friendly-copy lookup for user-mutation surfaces. Each caller
// passes its own `overrides` for per-action phrasing (the `last_admin`
// message reads differently depending on whether you're demoting,
// disabling, or deleting) plus a `fallback` for unmapped errors. Server
// reasons not present in `overrides` fall through to `err.message` then
// `fallback`.
function mapUserError(
  err: unknown,
  overrides: Partial<Record<string, string>>,
  fallback: string,
): string {
  const reason = extractReason(err);
  if (reason != null && reason in overrides) {
    const message = overrides[reason];
    if (message != null) return message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

function extractReason(err: unknown): string | undefined {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { reason?: string } }).data;
    return data?.reason;
  }
  return undefined;
}

// Per-surface message bundles. Kept near the call sites (not inline at
// `onError`) so adding a new reason is a one-line edit per surface.
const UPDATE_ERROR_MESSAGES: Partial<Record<string, string>> = {
  last_admin:
    "Can't do that — this is the last administrator. Promote someone else first.",
  email_taken: "A user with that email already exists.",
};
const STATUS_ERROR_MESSAGES: Partial<Record<string, string>> = {
  last_admin:
    "Can't disable the last administrator. Promote someone else first.",
};
const DELETE_ERROR_MESSAGES: Partial<Record<string, string>> = {
  last_admin:
    "Can't delete the last administrator. Promote someone else first.",
  has_posts:
    "This user has authored posts. Pick someone to reassign them to above.",
  reassign_to_self: "Can't reassign to the user being deleted.",
};

function UserEditSkeleton(): ReactNode {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading user"
      data-testid="user-edit-loading"
      className="mx-auto flex w-full max-w-xl flex-col gap-4"
    >
      <Skeleton className="h-4 w-24" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function NotFoundPlaceholder({ message }: { message: string }): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
