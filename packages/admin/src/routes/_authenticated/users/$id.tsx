import type { ReactNode } from "react";
import { useState } from "react";
import { FormEditSkeleton } from "@/components/form/edit-skeleton.js";
import { MetaBoxCard } from "@/components/meta-box/meta-box.js";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { hasCap } from "@/lib/caps.js";
import { visibleUserMetaBoxes } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import * as v from "valibot";

import type { UserMetaBoxManifestEntry } from "@plumix/core/manifest";
import type { User, UserRole } from "@plumix/core/schema";
import { seedFromMetaBoxes } from "@plumix/core/manifest";
import { idPathParam } from "@plumix/core/validation";

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
  author: "Author — publish own entries",
  contributor: "Contributor — draft, no publish",
  subscriber: "Subscriber — read only",
};

const profileFormSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.maxLength(100)),
  role: v.picklist(USER_ROLES),
});

export const Route = createFileRoute("/_authenticated/users/$id")({
  // Reject invalid ids as a router 404 before `beforeLoad` / `loader`
  // fire — no RPC, no stale-id flicker through the cache.
  params: {
    parse: (raw) => {
      const result = v.safeParse(idPathParam, raw.id);
      if (!result.success) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
        throw notFound();
      }
      return { id: result.output };
    },
  },
  // More permissive than `/users/` — a user without `user:list` can
  // still edit their OWN row, so this screen doubles as `/profile`
  // (which redirects here). Other-user edits require `user:list`; the
  // server's own `user:edit_own` / `user:edit` checks are the final
  // word, but surfacing the right screen is half the UX.
  beforeLoad: ({ context, params }) => {
    const isSelf = params.id === context.user.id;
    const canEditAny = hasCap(context.user.capabilities, "user:list");
    const canEditSelf =
      isSelf && hasCap(context.user.capabilities, "user:edit_own");
    if (!canEditAny && !canEditSelf) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/" });
    }
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.user.get.queryOptions({ input: { id: params.id } }),
    ),
  pendingComponent: () => (
    <FormEditSkeleton ariaLabel="Loading user" testId="user-edit-loading" />
  ),
  errorComponent: () => (
    <NotFoundPlaceholder message="Couldn't load that user. They may have been deleted." />
  ),
  component: UserEditRoute,
});

function UserEditRoute(): ReactNode {
  const { id: userId } = Route.useParams();
  const { user: session } = Route.useRouteContext();
  const isSelf = userId === session.id;

  // Self can't self-promote, self-disable, or self-delete — the `!isSelf`
  // gate mirrors WP's user-edit UX and keeps the last-admin-lockout
  // surface entirely server-side.
  function otherUserCap(cap: string): boolean {
    return !isSelf && hasCap(session.capabilities, cap);
  }
  const canPromote = otherUserCap("user:promote");
  const canDisable = otherUserCap("user:edit");
  const canDelete = otherUserCap("user:delete");
  // Match the server's actual write permission — editors can view the
  // edit screen (via `user:list`) but don't get `user:edit`, so we
  // disable Save / Name input instead of letting them hit a server 403.
  const canSave = isSelf
    ? hasCap(session.capabilities, "user:edit_own")
    : hasCap(session.capabilities, "user:edit");

  const { data: target } = useSuspenseQuery(
    orpc.user.get.queryOptions({ input: { id: userId } }),
  );
  const metaBoxes = visibleUserMetaBoxes(session.capabilities);
  return (
    <UserEditForm
      // Remount after each save so `useForm` re-reads `defaultValues`
      // from the refetched row. Same pattern as `/entries/$slug/$id`.
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
      metaBoxes={metaBoxes}
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
  metaBoxes,
}: {
  target: User;
  isSelf: boolean;
  canPromote: boolean;
  canSave: boolean;
  canDisable: boolean;
  canDelete: boolean;
  metaBoxes: readonly UserMetaBoxManifestEntry[];
}): ReactNode {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  // Meta rides the same Save as the profile fields — one `user.update`
  // call per form submission. Re-seeds from the server's post-sanitize
  // bag on success so coerce roundtrips show up in the UI.
  const [meta, setMeta] = useState<Record<string, unknown>>(() =>
    seedFromMetaBoxes(metaBoxes, target.meta),
  );

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
        meta: metaBoxes.length > 0 ? meta : undefined,
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: async (updated) => {
      setMeta(seedFromMetaBoxes(metaBoxes, updated.meta));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.user.get.queryOptions({ input: { id: target.id } })
            .queryKey,
        }),
        queryClient.invalidateQueries({ queryKey: orpc.user.list.key() }),
      ]);
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
    resolver: valibotResolver(profileFormSchema),
    defaultValues: {
      name: target.name ?? "",
      role: target.role,
    },
  });

  const onSubmit = form.handleSubmit((value) => {
    updateUser.mutate(value);
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
          <Form {...form}>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
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

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Name{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        autoComplete="name"
                        disabled={updateUser.isPending || !canSave}
                        data-testid="user-edit-name-input"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {canPromote ? (
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <FormControl>
                        <select
                          value={field.value}
                          onBlur={field.onBlur}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (isUserRole(next)) field.onChange(next);
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
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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

              {metaBoxes.map((box) => (
                <MetaBoxCard
                  key={box.id}
                  box={box}
                  values={meta}
                  disabled={updateUser.isPending || !canSave}
                  onChange={(key, value) => {
                    setMeta((prev) => ({ ...prev, [key]: value }));
                  }}
                />
              ))}

              {serverError ? (
                <Alert
                  variant="destructive"
                  data-testid="user-edit-server-error"
                >
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
                <Button
                  type="submit"
                  disabled={updateUser.isPending || !canSave}
                  data-testid="user-edit-submit"
                >
                  {updateUser.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {canDisable ? <StatusCard target={target} /> : null}
      {canDelete ? <DeleteCard target={target} /> : null}
    </div>
  );
}

function StatusCard({ target }: { target: User }): ReactNode {
  const queryClient = useQueryClient();
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
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.user.get.queryOptions({ input: { id: target.id } })
            .queryKey,
        }),
        queryClient.invalidateQueries({ queryKey: orpc.user.list.key() }),
      ]);
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
            : "Disabling signs the user out immediately and blocks future sign-ins. Their entries stay published."}
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
            {toggleButtonLabel(isDisabled, toggle.isPending)}
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

function toggleButtonLabel(isDisabled: boolean, isPending: boolean): string {
  if (isPending) return isDisabled ? "Enabling…" : "Disabling…";
  return isDisabled ? "Re-enable user" : "Disable user";
}

function DeleteCard({ target }: { target: User }): ReactNode {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    onSuccess: async () => {
      // Purge the now-deleted row from the list cache before we land
      // there — otherwise the destination renders stale within the
      // list's staleTime window.
      await queryClient.invalidateQueries({
        queryKey: orpc.user.list.key(),
      });
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
            Permanent. Their entries stay, but you'll choose who inherits
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
          If this user authored any entries, the next step reassigns them. Leave
          "Keep entries as-is" if they have none.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="reassign-to">Reassign entries to</Label>
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
            <option value="">Keep entries as-is (none to reassign)</option>
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
    "This user has authored entries. Pick someone to reassign them to above.",
  reassign_to_self: "Can't reassign to the user being deleted.",
};

function NotFoundPlaceholder({ message }: { message: string }): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
