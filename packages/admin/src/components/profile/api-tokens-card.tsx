import type { MessageDescriptor } from "@lingui/core";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty.js";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.js";
import { Input } from "@/components/ui/input.js";
import { Label as UILabel } from "@/components/ui/label.js";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js";
import { toDate } from "@/lib/dates.js";
import { orpc } from "@/lib/orpc.js";
import { parseScopesText } from "@/lib/scopes.js";
import { useFormatters } from "@/lib/use-formatters.js";
import { useLabel } from "@/lib/use-label.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import * as v from "valibot";

import type { Label } from "@plumix/core/i18n";
import { vMessage } from "@plumix/core/validation";

// Renders the API-token surface for a target user. Two modes:
//
//   `mode: "self"`     — calls self-scoped procedures (`apiTokens.list/
//                        create/revoke`). Used when the editor is the
//                        token owner.
//   `mode: "admin"`    — calls admin procedures (`apiTokens.adminList/
//                        adminRevoke`) scoped to a target userId.
//                        Mint isn't available cross-user — only the owner
//                        can mint, by design (matches GitHub's behaviour).
//
// Splitting on mode at the call boundary keeps the audit log
// distinguishing "user X minted/revoked their own" from "admin Y
// revoked user X's", and lets the create form be omitted entirely on
// the admin path.

const M = {
  // Validator messages
  nameRequired: defineMessage({
    id: "apiTokens.create.nameRequired",
    message: "Name is required.",
  }),
  nameTooLong: defineMessage({
    id: "apiTokens.create.nameTooLong",
    message: "Name must be ≤ 64 characters.",
  }),
  // Expiry option labels.
  expires7: defineMessage({ id: "apiTokens.expiry.7", message: "7 days" }),
  expires30: defineMessage({ id: "apiTokens.expiry.30", message: "30 days" }),
  expires90: defineMessage({ id: "apiTokens.expiry.90", message: "90 days" }),
  expiresNever: defineMessage({
    id: "apiTokens.expiry.never",
    message: "Never",
  }),
  // Mutation error fallbacks.
  mintFallback: defineMessage({
    id: "apiTokens.mint.fallback",
    message: "Couldn't mint token. Try again.",
  }),
  revokeFallback: defineMessage({
    id: "apiTokens.revoke.fallback",
    message: "Couldn't revoke. Try again.",
  }),
  // Placeholder copy.
  namePlaceholder: defineMessage({
    id: "apiTokens.create.namePlaceholder",
    message: "github-actions / claude-code / mcp-prod",
  }),
  // Copy-to-clipboard button aria-label.
  copyAria: defineMessage({
    id: "apiTokens.secret.copyAria",
    message: "Copy token",
  }),
  // Multi-line example capabilities for the textarea placeholder.
  // The tokens themselves (`entry:post:read`) are protocol-defined
  // identifiers and stay verbatim across locales; this exists so the
  // newline-joined literal isn't an unwrapped string at the callsite.
  capabilitiesPlaceholder: defineMessage({
    id: "apiTokens.create.capabilities.placeholder",
    message: "entry:post:read\nentry:post:edit_own",
  }),
} satisfies Record<string, MessageDescriptor>;

const createFormSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, vMessage(M.nameRequired)),
    v.maxLength(64, vMessage(M.nameTooLong)),
  ),
  expires: v.picklist(["7", "30", "90", "never"]),
  scopeMode: v.picklist(["inherit", "restrict"]),
  scopesText: v.pipe(v.string(), v.maxLength(4096)),
});

type CreateFormValues = v.InferOutput<typeof createFormSchema>;

const EXPIRY_DESCRIPTOR: Record<
  CreateFormValues["expires"],
  MessageDescriptor
> = {
  "7": M.expires7,
  "30": M.expires30,
  "90": M.expires90,
  never: M.expiresNever,
};

const EXPIRY_DAYS: Record<CreateFormValues["expires"], number | null> = {
  "7": 7,
  "30": 30,
  "90": 90,
  never: null,
};

interface TokenRow {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly scopes: readonly string[] | null;
  readonly expiresAt: Date | string | null;
  readonly lastUsedAt: Date | string | null;
}

// Public surface — two thin wrappers below choose the right data /
// mutation hooks. Splitting at the call site keeps `useQuery` /
// `useMutation` order stable (rules-of-hooks) and gives us per-mode
// react-query keys without conditional hook calls.

export function SelfApiTokensCard(): ReactNode {
  const queryClient = useQueryClient();
  const list = useQuery(orpc.auth.apiTokens.list.queryOptions({ input: {} }));

  const create = useMutation({
    mutationFn: (input: {
      name: string;
      expiresInDays: number | null;
      scopes: readonly string[] | null;
    }) =>
      orpc.auth.apiTokens.create.call({
        name: input.name,
        expiresInDays: input.expiresInDays,
        scopes: input.scopes === null ? null : [...input.scopes],
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.auth.apiTokens.list.key(),
      }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => orpc.auth.apiTokens.revoke.call({ id }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.auth.apiTokens.list.key(),
      }),
  });

  return (
    <ApiTokensCardView
      mode="self"
      tokens={list.data ?? []}
      isLoading={list.isLoading}
      onMint={(input, cbs) => create.mutate(input, cbs)}
      mintPending={create.isPending}
      onRevoke={(id, cbs) => revoke.mutate(id, cbs)}
      revokePending={revoke.isPending}
    />
  );
}

export function AdminApiTokensCard({ userId }: { userId: number }): ReactNode {
  const queryClient = useQueryClient();
  const list = useQuery(
    orpc.auth.apiTokens.adminList.queryOptions({ input: { userId } }),
  );

  const revoke = useMutation({
    mutationFn: (id: string) => orpc.auth.apiTokens.adminRevoke.call({ id }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.auth.apiTokens.adminList.key(),
      }),
  });

  // No `onMint` — minting requires the owner's authenticated browser
  // session, by design (matches GitHub's "you can revoke another
  // user's PAT but you can't mint one for them"). The shared view
  // omits the create form when `onMint` is undefined.
  return (
    <ApiTokensCardView
      mode="admin"
      tokens={list.data?.items ?? []}
      isLoading={list.isLoading}
      onRevoke={(id, cbs) => revoke.mutate(id, cbs)}
      revokePending={revoke.isPending}
    />
  );
}

interface MintInput {
  name: string;
  expiresInDays: number | null;
  scopes: readonly string[] | null;
}
interface MintResult {
  secret: string;
  token: { name: string };
}
interface MutationCallbacks<TResult> {
  onSuccess?: (data: TResult) => void;
  onError?: (err: unknown) => void;
}

function ApiTokensCardView({
  mode,
  tokens,
  isLoading,
  onMint,
  mintPending = false,
  onRevoke,
  revokePending,
}: {
  mode: "self" | "admin";
  tokens: readonly TokenRow[];
  isLoading: boolean;
  onMint?: (
    input: MintInput,
    callbacks?: MutationCallbacks<MintResult>,
  ) => void;
  mintPending?: boolean;
  onRevoke: (id: string, callbacks?: MutationCallbacks<unknown>) => void;
  revokePending: boolean;
}): ReactNode {
  const label = useLabel();
  const [mintedSecret, setMintedSecret] = useState<{
    secret: string;
    name: string;
  } | null>(null);
  const [createError, setCreateError] = useState<Label | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [revokeError, setRevokeError] = useState<Label | null>(null);

  // Hoisted: lingui/no-expression-in-message rejects member exprs inline.
  const bdiRevokeName = <bdi>{revokeTarget?.name ?? ""}</bdi>;

  return (
    <Card data-testid="api-tokens-card">
      <CardHeader>
        <CardTitle>
          <Trans id="apiTokens.title" message="API tokens" />
        </CardTitle>
        <CardDescription>
          {mode === "self" ? (
            <Trans
              id="apiTokens.description.self"
              message="Personal access tokens for CLIs, MCP servers, CI bots, or any other non-browser client. The full secret is shown once at mint time."
            />
          ) : (
            <Trans
              id="apiTokens.description.admin"
              message="Tokens minted by this user. You can revoke any of them — minting requires the owner's authenticated browser session."
            />
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {onMint ? (
          <CreateTokenForm
            onSubmit={(values) => {
              setCreateError(null);
              const scopes =
                values.scopeMode === "inherit"
                  ? null
                  : parseScopesText(values.scopesText);
              onMint(
                {
                  name: values.name,
                  expiresInDays: EXPIRY_DAYS[values.expires],
                  scopes,
                },
                {
                  onSuccess: (result) => {
                    setMintedSecret({
                      secret: result.secret,
                      name: result.token.name,
                    });
                  },
                  onError: (err) => {
                    setCreateError(
                      err instanceof Error ? err.message : M.mintFallback,
                    );
                  },
                },
              );
            }}
            pending={mintPending}
            error={createError}
          />
        ) : null}

        {isLoading ? (
          <p
            className="text-muted-foreground text-sm"
            data-testid="api-tokens-loading"
          >
            <Trans id="apiTokens.loading" message="Loading tokens…" />
          </p>
        ) : tokens.length === 0 ? (
          <Empty data-testid="api-tokens-empty">
            <EmptyHeader>
              <EmptyTitle>
                <Trans id="apiTokens.empty.title" message="No tokens yet" />
              </EmptyTitle>
              <EmptyDescription>
                {mode === "self" ? (
                  <Trans
                    id="apiTokens.empty.description.self"
                    message="Mint one above for your CLI / MCP server / CI bot."
                  />
                ) : (
                  <Trans
                    id="apiTokens.empty.description.admin"
                    message="This user hasn't minted any API tokens."
                  />
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table data-testid="api-tokens-table">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Trans id="apiTokens.col.name" message="Name" />
                </TableHead>
                <TableHead>
                  <Trans id="apiTokens.col.prefix" message="Prefix" />
                </TableHead>
                <TableHead>
                  <Trans id="apiTokens.col.scopes" message="Scopes" />
                </TableHead>
                <TableHead>
                  <Trans id="apiTokens.col.lastUsed" message="Last used" />
                </TableHead>
                <TableHead>
                  <Trans id="apiTokens.col.expires" message="Expires" />
                </TableHead>
                <TableHead className="w-[1%] text-end">
                  <Trans id="apiTokens.col.actions" message="Actions" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow
                  key={token.id}
                  data-testid={`api-tokens-row-${token.id}`}
                >
                  <TableCell>
                    <span className="font-medium">{token.name}</span>
                  </TableCell>
                  <TableCell>
                    <code className="text-muted-foreground font-mono text-xs">
                      {token.prefix}…
                    </code>
                  </TableCell>
                  <TableCell>
                    <ScopeBadges scopes={token.scopes} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <RelativeOrNever when={token.lastUsedAt} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <RelativeOrNever when={token.expiresAt} />
                  </TableCell>
                  <TableCell className="text-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRevokeTarget({ id: token.id, name: token.name })
                      }
                      data-testid={`api-tokens-revoke-${token.id}`}
                    >
                      <Trans id="apiTokens.revoke.button" message="Revoke" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <SecretShownDialog
        secret={mintedSecret?.secret ?? null}
        name={mintedSecret?.name ?? ""}
        onClose={() => setMintedSecret(null)}
      />

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
                id="apiTokens.revoke.title"
                message='Revoke "{name}"?'
                values={{ name: bdiRevokeName }}
                comment="name: the user-chosen token nickname (e.g. 'CI deploy key')"
              />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                id="apiTokens.revoke.description"
                message="The token stops working immediately. Any client using it will start getting 401s on the next request."
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revokeError ? (
            <Alert variant="destructive" data-testid="api-tokens-revoke-error">
              <AlertDescription>{label(revokeError)}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokePending}>
              <Trans id="apiTokens.revoke.cancel" message="Cancel" />
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="api-tokens-revoke-confirm-button"
              disabled={revokePending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!revokeTarget) return;
                setRevokeError(null);
                onRevoke(revokeTarget.id, {
                  onSuccess: () => setRevokeTarget(null),
                  onError: (err) => {
                    setRevokeError(
                      err instanceof Error ? err.message : M.revokeFallback,
                    );
                  },
                });
              }}
            >
              {revokePending ? (
                <Trans id="apiTokens.revoke.pending" message="Revoking…" />
              ) : (
                <Trans id="apiTokens.revoke.confirm" message="Revoke" />
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function CreateTokenForm({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (values: CreateFormValues) => void;
  pending: boolean;
  error: Label | null;
}): ReactNode {
  const label = useLabel();
  const form = useForm({
    resolver: valibotResolver(createFormSchema),
    defaultValues: {
      name: "",
      expires: "90" as const,
      scopeMode: "inherit" as const,
      scopesText: "",
    },
    mode: "onBlur",
  });
  const scopeMode = useWatch({ control: form.control, name: "scopeMode" });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4 border-b pb-6"
        onSubmit={form.handleSubmit((values) => {
          onSubmit(values);
          form.reset();
        })}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Trans id="apiTokens.create.name" message="Name" />
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={label(M.namePlaceholder)}
                  disabled={pending}
                  data-testid="api-tokens-create-name-input"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="expires"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Trans id="apiTokens.create.expires" message="Expires" />
              </FormLabel>
              <FormControl>
                <select
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={pending}
                  data-testid="api-tokens-create-expires-select"
                  className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                >
                  {(
                    Object.keys(
                      EXPIRY_DESCRIPTOR,
                    ) as CreateFormValues["expires"][]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {label(EXPIRY_DESCRIPTOR[value])}
                    </option>
                  ))}
                </select>
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
              <FormLabel>
                <Trans
                  id="apiTokens.create.permissions"
                  message="Permissions"
                />
              </FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="inherit"
                      id="api-token-scope-inherit"
                      disabled={pending}
                      data-testid="api-tokens-create-scope-inherit-radio"
                    />
                    <UILabel
                      htmlFor="api-token-scope-inherit"
                      className="font-normal"
                    >
                      <Trans
                        id="apiTokens.create.scope.inherit"
                        message="Inherit all your permissions"
                      />
                    </UILabel>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="restrict"
                      id="api-token-scope-restrict"
                      disabled={pending}
                      data-testid="api-tokens-create-scope-restrict-radio"
                    />
                    <UILabel
                      htmlFor="api-token-scope-restrict"
                      className="font-normal"
                    >
                      <Trans
                        id="apiTokens.create.scope.restrict"
                        message="Restrict to specific capabilities"
                      />
                    </UILabel>
                  </div>
                </RadioGroup>
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
                <FormLabel>
                  <Trans
                    id="apiTokens.create.capabilities"
                    message="Capabilities"
                  />
                </FormLabel>
                <FormControl>
                  <textarea
                    rows={4}
                    placeholder={label(M.capabilitiesPlaceholder)}
                    disabled={pending}
                    data-testid="api-tokens-create-scopes-textarea"
                    className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
                    {...field}
                  />
                </FormControl>
                <p className="text-muted-foreground text-xs">
                  <Trans
                    id="apiTokens.create.capabilities.help"
                    message="One capability per line. The token can never exceed the caps your role grants — this is an additional narrowing."
                  />
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        {error ? (
          <Alert variant="destructive" data-testid="api-tokens-create-error">
            <AlertDescription>{label(error)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={pending}
            data-testid="api-tokens-create-submit"
          >
            <Plus className="size-4" />
            {pending ? (
              <Trans id="apiTokens.create.submit.pending" message="Minting…" />
            ) : (
              <Trans id="apiTokens.create.submit.idle" message="Mint token" />
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function SecretShownDialog({
  secret,
  name,
  onClose,
}: {
  secret: string | null;
  name: string;
  onClose: () => void;
}): ReactNode {
  const label = useLabel();
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.getElementById("api-tokens-secret-input");
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    }
  };

  return (
    <AlertDialog
      open={secret !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <AlertDialogContent data-testid="api-tokens-secret-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans
              id="apiTokens.secret.title"
              message='Token "{name}" minted'
              values={{ name: <bdi>{name}</bdi> }}
              comment="name: the user-chosen token nickname (e.g. 'CI deploy key')"
            />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans
              id="apiTokens.secret.description"
              message="Copy the secret now. We won't show it again — losing it means revoking and re-minting."
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex gap-2">
          <input
            id="api-tokens-secret-input"
            readOnly
            value={secret ?? ""}
            onFocus={(e) => e.currentTarget.select()}
            data-testid="api-tokens-secret-input"
            className="border-input bg-muted text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 font-mono text-sm focus-visible:outline-none"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void copy();
            }}
            data-testid="api-tokens-secret-copy-button"
            aria-label={label(M.copyAria)}
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={onClose}
            data-testid="api-tokens-secret-done-button"
          >
            <Trans id="apiTokens.secret.done" message="Done" />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Renders a relative-time string when the timestamp is set, otherwise
// the localized "Never" placeholder. Used by both the lastUsed and
// expires columns — they share the formatter call so the table row
// pulls `useFormatters` once at this seam instead of in the parent.
function RelativeOrNever({ when }: { when: Date | string | null }): ReactNode {
  const { formatRelative } = useFormatters();
  if (when === null) return <Trans id="apiTokens.never" message="Never" />;
  return <>{formatRelative(toDate(when))}</>;
}

function ScopeBadges({
  scopes,
}: {
  scopes: readonly string[] | null;
}): ReactNode {
  if (scopes === null) {
    return (
      <Badge variant="outline" data-testid="api-tokens-scope-inherit">
        <Trans id="apiTokens.scope.inheritRole" message="Inherit role" />
      </Badge>
    );
  }
  if (scopes.length === 0) {
    return (
      <Badge variant="outline" data-testid="api-tokens-scope-empty">
        <Trans id="apiTokens.scope.empty" message="No caps" />
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {scopes.map((scope) => (
        <Badge
          key={scope}
          variant="secondary"
          data-testid={`api-tokens-scope-${scope}`}
        >
          {scope}
        </Badge>
      ))}
    </div>
  );
}
