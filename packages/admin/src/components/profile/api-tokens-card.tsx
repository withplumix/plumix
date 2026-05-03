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
import { Label } from "@/components/ui/label.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js";
import { formatRelative, toDate } from "@/lib/dates.js";
import { orpc } from "@/lib/orpc.js";
import { parseScopesText } from "@/lib/scopes.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import * as v from "valibot";

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

const createFormSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Name is required."),
    v.maxLength(64, "Name must be ≤ 64 characters."),
  ),
  expires: v.picklist(["7", "30", "90", "never"]),
  scopeMode: v.picklist(["inherit", "restrict"]),
  scopesText: v.pipe(v.string(), v.maxLength(4096)),
});

type CreateFormValues = v.InferOutput<typeof createFormSchema>;

const EXPIRY_LABEL: Record<CreateFormValues["expires"], string> = {
  "7": "7 days",
  "30": "30 days",
  "90": "90 days",
  never: "Never",
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
  const [mintedSecret, setMintedSecret] = useState<{
    secret: string;
    name: string;
  } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  return (
    <Card data-testid="api-tokens-card">
      <CardHeader>
        <CardTitle>API tokens</CardTitle>
        <CardDescription>
          {mode === "self"
            ? "Personal access tokens for CLIs, MCP servers, CI bots, or any other non-browser client. The full secret is shown once at mint time."
            : "Tokens minted by this user. You can revoke any of them — minting requires the owner's authenticated browser session."}
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
                      err instanceof Error
                        ? err.message
                        : "Couldn't mint token. Try again.",
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
            Loading tokens…
          </p>
        ) : tokens.length === 0 ? (
          <Empty data-testid="api-tokens-empty">
            <EmptyHeader>
              <EmptyTitle>No tokens yet</EmptyTitle>
              <EmptyDescription>
                {mode === "self"
                  ? "Mint one above for your CLI / MCP server / CI bot."
                  : "This user hasn't minted any API tokens."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table data-testid="api-tokens-table">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-[1%] text-right">Actions</TableHead>
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
                    {token.lastUsedAt
                      ? formatRelative(toDate(token.lastUsedAt))
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {token.expiresAt
                      ? formatRelative(toDate(token.expiresAt))
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRevokeTarget({ id: token.id, name: token.name })
                      }
                      data-testid={`api-tokens-revoke-${token.id}`}
                    >
                      Revoke
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
            <AlertDialogTitle>Revoke "{revokeTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The token stops working immediately. Any client using it will
              start getting 401s on the next request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revokeError ? (
            <Alert variant="destructive" data-testid="api-tokens-revoke-error">
              <AlertDescription>{revokeError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokePending}>
              Cancel
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
                      err instanceof Error
                        ? err.message
                        : "Couldn't revoke. Try again.",
                    );
                  },
                });
              }}
            >
              {revokePending ? "Revoking…" : "Revoke"}
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
  error: string | null;
}): ReactNode {
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
  const scopeMode = form.watch("scopeMode");

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
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="github-actions / claude-code / mcp-prod"
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
              <FormLabel>Expires</FormLabel>
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
                    Object.keys(EXPIRY_LABEL) as CreateFormValues["expires"][]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {EXPIRY_LABEL[value]}
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
                      data-testid="api-tokens-create-scope-inherit-radio"
                    />
                    Inherit all your permissions
                  </Label>
                  <Label className="flex items-center gap-2 font-normal">
                    <input
                      type="radio"
                      name={field.name}
                      value="restrict"
                      checked={field.value === "restrict"}
                      onChange={() => field.onChange("restrict")}
                      disabled={pending}
                      data-testid="api-tokens-create-scope-restrict-radio"
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
                    data-testid="api-tokens-create-scopes-textarea"
                    className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
                    {...field}
                  />
                </FormControl>
                <p className="text-muted-foreground text-xs">
                  One capability per line. The token can never exceed the caps
                  your role grants — this is an additional narrowing.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        {error ? (
          <Alert variant="destructive" data-testid="api-tokens-create-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={pending}
            data-testid="api-tokens-create-submit"
          >
            <Plus className="size-4" />
            {pending ? "Minting…" : "Mint token"}
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
          <AlertDialogTitle>Token "{name}" minted</AlertDialogTitle>
          <AlertDialogDescription>
            Copy the secret now. We won't show it again — losing it means
            revoking and re-minting.
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
            aria-label="Copy token"
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
            Done
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ScopeBadges({
  scopes,
}: {
  scopes: readonly string[] | null;
}): ReactNode {
  if (scopes === null) {
    return (
      <Badge variant="outline" data-testid="api-tokens-scope-inherit">
        Inherit role
      </Badge>
    );
  }
  if (scopes.length === 0) {
    return (
      <Badge variant="outline" data-testid="api-tokens-scope-empty">
        No caps
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
