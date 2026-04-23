import type { ReactNode } from "react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
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
import { ADMIN_BASE_PATH } from "@/lib/constants.js";
import { orpc } from "@/lib/orpc.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { useForm } from "react-hook-form";
import * as v from "valibot";

import type { User, UserRole } from "@plumix/core/schema";

import {
  isUserRole,
  USER_ROLES,
  USERS_LIST_DEFAULT_SEARCH,
} from "./-constants.js";

// Long-form labels for the invite-flow dropdown — users picking a role
// for someone else want the trade-offs spelled out. The list view uses
// the short form (just the noun) since a badge has no room for copy.
const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrator — full control",
  editor: "Editor — publish + edit any post",
  author: "Author — publish own entries",
  contributor: "Contributor — draft, no publish",
  subscriber: "Subscriber — read only",
};

// Client-side validation mirrors `userInviteInputSchema` on the server so
// the user gets instant feedback; the server remains the authoritative
// gate.
const inviteFormSchema = v.object({
  email: v.pipe(
    v.string(),
    v.trim(),
    v.email("Enter a valid email address"),
    v.maxLength(255),
  ),
  name: v.pipe(v.string(), v.trim(), v.maxLength(100)),
  role: v.picklist(USER_ROLES),
});

export const Route = createFileRoute("/_authenticated/users/new")({
  beforeLoad: ({ context }) => {
    // `user:create` is admin-only. Defense in depth — the sidebar button
    // is already gated on this cap but someone following a direct link
    // shouldn't land on a forbidden form.
    if (!hasCap(context.user.capabilities, "user:create")) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/users", search: USERS_LIST_DEFAULT_SEARCH });
    }
  },
  component: InviteUserRoute,
});

// We render one of two views: the form (idle) or the success screen with
// the shareable URL. The submitting state is tracked separately via
// `inviteUser.isPending`, not by this union. Discriminated union here so
// the success payload (user + url) correlates with the status without
// nullable juggling.
type ViewState =
  | { status: "idle" }
  | { status: "success"; user: User; inviteUrl: string };

function InviteUserRoute(): ReactNode {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>({ status: "idle" });
  const [serverError, setServerError] = useState<string | null>(null);

  const inviteUser = useMutation({
    mutationFn: (input: { email: string; name: string; role: UserRole }) =>
      orpc.user.invite.call({
        email: input.email,
        role: input.role,
        ...(input.name.length > 0 ? { name: input.name } : {}),
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: (result) => {
      setView({
        status: "success",
        user: result.user,
        inviteUrl: buildInviteUrl(result.inviteToken),
      });
    },
    onError: (err) => {
      setServerError(mapInviteError(err));
    },
  });

  const form = useForm({
    resolver: valibotResolver(inviteFormSchema),
    defaultValues: { email: "", name: "", role: "subscriber" as UserRole },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((value) => {
    inviteUser.mutate(value);
  });

  if (view.status === "success") {
    return (
      <InviteSuccess
        user={view.user}
        inviteUrl={view.inviteUrl}
        onInviteAnother={() => {
          setView({ status: "idle" });
          setServerError(null);
          form.reset();
        }}
        onBackToList={() => {
          void navigate({ to: "/users", search: USERS_LIST_DEFAULT_SEARCH });
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        to="/users"
        search={USERS_LIST_DEFAULT_SEARCH}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        data-testid="invite-back-link"
      >
        <ArrowLeft className="size-4" />
        Back to users
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 data-testid="invite-heading">Invite user</h1>
          </CardTitle>
          <CardDescription>
            They'll enrol a passkey the first time they open the invite link. No
            password required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        required
                        disabled={inviteUser.isPending}
                        data-testid="invite-email-input"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                        disabled={inviteUser.isPending}
                        data-testid="invite-name-input"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                          // `<option>` values come from `USER_ROLES`, but the
                          // DOM types `e.target.value` as a bare string. Guard
                          // via `includes` so a future refactor that adds a
                          // raw option can't silently slip a bad role past TS.
                          const next = e.target.value;
                          if (isUserRole(next)) field.onChange(next);
                        }}
                        disabled={inviteUser.isPending}
                        data-testid="invite-role-select"
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

              {serverError ? (
                <Alert variant="destructive" data-testid="invite-server-error">
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
                  disabled={inviteUser.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={inviteUser.isPending}
                  data-testid="invite-submit"
                >
                  {inviteUser.isPending ? "Inviting…" : "Send invite"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

// Absolute URL so the admin can copy-paste into an email client without
// post-processing. Admin is SPA-only so `window` is always defined here
// (jsdom covers the test path).
function buildInviteUrl(token: string): string {
  return `${window.location.origin}${ADMIN_BASE_PATH}/accept-invite/${token}`;
}

// Surface server-side errors with a human-friendly message where we can.
// The RPC layer throws with `.data.reason` on CONFLICT — everything else
// falls through as a generic "try again".
function mapInviteError(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { reason?: string } }).data;
    if (data?.reason === "email_taken") {
      return "A user with that email already exists.";
    }
  }
  if (err instanceof Error) return err.message;
  return "Couldn't send invite. Try again.";
}

function InviteSuccess({
  user,
  inviteUrl,
  onInviteAnother,
  onBackToList,
}: {
  user: User;
  inviteUrl: string;
  onInviteAnother: () => void;
  onBackToList: () => void;
}): ReactNode {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Clipboard API is gated in non-HTTPS / iframed / Permissions-Policy
      // contexts. Select the input so the user can fall back to ⌘-C /
      // Ctrl-C — better than a dead button that looks like it worked.
      const input = document.getElementById("invite-url");
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 data-testid="invite-success-heading">Invite ready</h1>
          </CardTitle>
          <CardDescription>
            Share the link below with {user.email}. They'll enrol a passkey the
            first time they open it. Link expires in 7 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-url">Invite link</Label>
            <div className="flex gap-2">
              <input
                id="invite-url"
                readOnly
                value={inviteUrl}
                onFocus={(e) => {
                  e.currentTarget.select();
                }}
                data-testid="invite-url-input"
                className="border-input bg-muted text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 font-mono text-sm focus-visible:outline-none"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void copy();
                }}
                data-testid="invite-copy-button"
                aria-label="Copy invite link"
              >
                {copied ? (
                  <>
                    <Check />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onInviteAnother}
              data-testid="invite-another-button"
            >
              Invite another
            </Button>
            <Button
              type="button"
              onClick={onBackToList}
              data-testid="invite-done-button"
            >
              Back to users
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
