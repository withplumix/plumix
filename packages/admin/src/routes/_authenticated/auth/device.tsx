import type { ReactNode } from "react";
import { useEffect, useState } from "react";
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
import { extractCode, extractReason } from "@/lib/orpc-errors.js";
import { orpc } from "@/lib/orpc.js";
import { parseScopesText } from "@/lib/scopes.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import * as v from "valibot";

// Admin-side approval page for OAuth 2.0 Device Authorization Grant
// (RFC 8628). The CLI prints a URL like
// `https://cms.example/_plumix/admin/auth/device?user_code=ABCD-EFGH`
// and waits while the human approves here.
//
// Two phases:
//   1. Lookup — verify the typed code maps to a pending row this user
//      can approve. Surfaces expired / already-approved / already-denied
//      / not-found inline rather than at submit time.
//   2. Approve / Deny — name the to-be-minted token, optionally
//      restrict its scopes, then approve. Or explicitly deny — the
//      polling client gets `access_denied` immediately.

const lookupSchema = v.object({
  userCode: v.pipe(v.string(), v.trim(), v.maxLength(32)),
});

const approveSchema = v.object({
  tokenName: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Name is required."),
    v.maxLength(64, "Name must be ≤ 64 characters."),
  ),
  scopeMode: v.picklist(["inherit", "restrict"]),
  scopesText: v.pipe(v.string(), v.maxLength(4096)),
});

const deviceSearchSchema = v.object({
  user_code: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(32))),
});

export const Route = createFileRoute("/_authenticated/auth/device")({
  validateSearch: deviceSearchSchema,
  component: DeviceApprovalRoute,
});

type Phase =
  | { kind: "lookup" }
  | { kind: "approve"; userCode: string }
  | { kind: "approved" }
  | { kind: "denied" };

function DeviceApprovalRoute(): ReactNode {
  const search = Route.useSearch();
  const [phase, setPhase] = useState<Phase>(() =>
    search.user_code
      ? { kind: "approve", userCode: search.user_code }
      : { kind: "lookup" },
  );
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Deep-link case: when the page mounts with `?user_code=...`,
  // pre-validate the code so the approval form only renders for
  // valid pending codes. Otherwise we'd ask the user to type a
  // token name then surface the "expired" error post-submit.
  // Manual-lookup phase doesn't run this — it goes through the
  // `lookup` mutation in `LookupCard`. Mount-only by design.
  useEffect(() => {
    if (phase.kind === "approve") {
      void orpc.auth.deviceFlow.lookup
        .call({ userCode: phase.userCode })
        .catch((err: unknown) => {
          setLookupError(formatLookupError(err));
          setPhase({ kind: "lookup" });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only deep-link validation
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1
          className="text-2xl font-semibold"
          data-testid="auth-device-heading"
        >
          Authorize CLI access
        </h1>
        <p className="text-muted-foreground text-sm">
          A CLI is requesting an API token for your account. Confirm the code
          your CLI is showing matches the one below before approving.
        </p>
      </header>

      {phase.kind === "lookup" ? (
        <LookupCard
          initialError={lookupError}
          onValid={(userCode) => {
            setLookupError(null);
            setPhase({ kind: "approve", userCode });
          }}
        />
      ) : null}

      {phase.kind === "approve" ? (
        <ApproveCard
          userCode={phase.userCode}
          onApproved={() => setPhase({ kind: "approved" })}
          onDenied={() => setPhase({ kind: "denied" })}
          onCancel={() => setPhase({ kind: "lookup" })}
        />
      ) : null}

      {phase.kind === "approved" ? (
        <Alert data-testid="auth-device-approved-alert">
          <AlertDescription>
            Approved. Your CLI should pick up the token within a few seconds —
            you can close this tab.
          </AlertDescription>
        </Alert>
      ) : null}

      {phase.kind === "denied" ? (
        <Alert variant="destructive" data-testid="auth-device-denied-alert">
          <AlertDescription>
            Denied. The CLI will get an access_denied response and stop polling.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function LookupCard({
  initialError,
  onValid,
}: {
  initialError: string | null;
  onValid: (userCode: string) => void;
}): ReactNode {
  const [error, setError] = useState<string | null>(initialError);
  const form = useForm({
    resolver: valibotResolver(lookupSchema),
    defaultValues: { userCode: "" },
    mode: "onSubmit",
  });

  const lookup = useMutation({
    mutationFn: (userCode: string) =>
      orpc.auth.deviceFlow.lookup.call({ userCode }),
    onMutate: () => setError(null),
    onSuccess: (_data, userCode) => onValid(userCode),
    onError: (err) => {
      setError(formatLookupError(err));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter the code from your CLI</CardTitle>
        <CardDescription>
          The CLI shows an 8-character code split with a dash — "ABCD-EFGH".
          Letters and digits only, no zeros or ones.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => {
              lookup.mutate(values.userCode);
            })}
          >
            <FormField
              control={form.control}
              name="userCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User code</FormLabel>
                  <FormControl>
                    <Input
                      autoFocus
                      autoComplete="off"
                      placeholder="ABCD-EFGH"
                      disabled={lookup.isPending}
                      data-testid="auth-device-usercode-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error ? (
              <Alert
                variant="destructive"
                data-testid="auth-device-lookup-error"
              >
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={lookup.isPending}
                data-testid="auth-device-lookup-submit"
              >
                {lookup.isPending ? "Checking…" : "Continue"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function ApproveCard({
  userCode,
  onApproved,
  onDenied,
  onCancel,
}: {
  userCode: string;
  onApproved: () => void;
  onDenied: () => void;
  onCancel: () => void;
}): ReactNode {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: valibotResolver(approveSchema),
    defaultValues: {
      tokenName: "CLI",
      scopeMode: "inherit" as const,
      scopesText: "",
    },
    mode: "onBlur",
  });
  const scopeMode = form.watch("scopeMode");

  const approve = useMutation({
    mutationFn: (input: {
      tokenName: string;
      scopes: readonly string[] | null;
    }) =>
      orpc.auth.deviceFlow.approve.call({
        userCode,
        tokenName: input.tokenName,
        scopes: input.scopes === null ? null : [...input.scopes],
      }),
    onMutate: () => setError(null),
    onSuccess: () => onApproved(),
    onError: (err) => {
      setError(formatApproveError(err));
    },
  });

  const deny = useMutation({
    mutationFn: () => orpc.auth.deviceFlow.deny.call({ userCode }),
    onMutate: () => setError(null),
    onSuccess: () => onDenied(),
    onError: (err) => {
      setError(formatApproveError(err));
    },
  });

  const pending = approve.isPending || deny.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm "{userCode}"</CardTitle>
        <CardDescription>
          A new API token will be minted for your account and handed to the CLI.
          Name it so you can find it later under your profile, and optionally
          restrict what it can do.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => {
              const scopes =
                values.scopeMode === "inherit"
                  ? null
                  : parseScopesText(values.scopesText);
              approve.mutate({ tokenName: values.tokenName, scopes });
            })}
          >
            <FormField
              control={form.control}
              name="tokenName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Token name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="claude-code / github-actions / mcp-prod"
                      disabled={pending}
                      data-testid="auth-device-tokenname-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="scopeMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Permissions</FormLabel>
                  <FormControl>
                    <div className="flex flex-col gap-2">
                      <Label className="flex items-center gap-2 font-normal">
                        <input
                          type="radio"
                          name={field.name}
                          value="inherit"
                          checked={field.value === "inherit"}
                          onChange={() => field.onChange("inherit")}
                          disabled={pending}
                          data-testid="auth-device-scope-inherit-radio"
                        />
                        Inherit all my permissions
                      </Label>
                      <Label className="flex items-center gap-2 font-normal">
                        <input
                          type="radio"
                          name={field.name}
                          value="restrict"
                          checked={field.value === "restrict"}
                          onChange={() => field.onChange("restrict")}
                          disabled={pending}
                          data-testid="auth-device-scope-restrict-radio"
                        />
                        Restrict to specific capabilities
                      </Label>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {scopeMode === "restrict" ? (
              <FormField
                control={form.control}
                name="scopesText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capabilities</FormLabel>
                    <FormControl>
                      <textarea
                        rows={4}
                        placeholder={"entry:post:read\nentry:post:edit_own"}
                        disabled={pending}
                        data-testid="auth-device-scopes-textarea"
                        className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {error ? (
              <Alert variant="destructive" data-testid="auth-device-error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={onCancel}
                data-testid="auth-device-cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => deny.mutate()}
                data-testid="auth-device-deny-button"
              >
                {deny.isPending ? "Denying…" : "Deny"}
              </Button>
              <Button
                type="submit"
                disabled={pending}
                data-testid="auth-device-approve-button"
              >
                {approve.isPending ? "Approving…" : "Approve"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function formatLookupError(err: unknown): string {
  // CONFLICT carries the lifecycle reason (expired / already_approved /
  // already_denied); NOT_FOUND signals "no row matches this user_code".
  // Branch on code first so a future CONFLICT/reason addition doesn't
  // silently fall through to the generic message.
  const code = extractCode(err);
  if (code === "NOT_FOUND") {
    return "Code not found. Check it matches what your CLI printed.";
  }
  if (code === "CONFLICT") {
    const reason = extractReason(err);
    if (reason === "expired") {
      return "This code has expired. Re-run your CLI to get a new one.";
    }
    if (reason === "already_approved") {
      return "This code has already been approved. Re-run your CLI if it didn't pick the token up.";
    }
    if (reason === "already_denied") {
      return "This code has already been denied.";
    }
  }
  return "Couldn't look up that code. Try again.";
}

function formatApproveError(err: unknown): string {
  if (extractCode(err) === "CONFLICT") {
    const reason = extractReason(err);
    if (reason === "expired") {
      return "This code expired before you could finish — re-run your CLI.";
    }
    if (reason === "already_approved") {
      return "This code was already approved on another tab.";
    }
    if (reason === "already_denied") {
      return "This code was already denied.";
    }
  }
  return "Couldn't complete the request. Try again.";
}
