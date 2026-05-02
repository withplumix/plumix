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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Toggle } from "@/components/ui/toggle.js";
import { hasCap } from "@/lib/caps.js";
import { orpc } from "@/lib/orpc.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import * as v from "valibot";

import type { AllowedDomain, UserRole } from "@plumix/core/schema";

const USER_ROLES = [
  "subscriber",
  "contributor",
  "author",
  "editor",
  "admin",
] as const satisfies readonly UserRole[];

const ROLE_LABEL: Record<UserRole, string> = {
  subscriber: "Subscriber",
  contributor: "Contributor",
  author: "Author",
  editor: "Editor",
  admin: "Administrator",
};

// Mirrors the server schema in
// packages/core/src/rpc/procedures/auth/allowed-domains/schemas.ts.
const DOMAIN_REGEX =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const createFormSchema = v.object({
  domain: v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.regex(DOMAIN_REGEX, "Enter a valid hostname (e.g. example.com)."),
  ),
  defaultRole: v.picklist(USER_ROLES),
});

export const Route = createFileRoute("/_authenticated/allowed-domains/")({
  beforeLoad: ({ context }) => {
    if (!hasCap(context.user.capabilities, "settings:manage")) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/" });
    }
  },
  component: AllowedDomainsRoute,
});

function AllowedDomainsRoute(): ReactNode {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const list = useQuery(
    orpc.auth.allowedDomains.list.queryOptions({ input: {} }),
  );

  const invalidateList = (): Promise<void> =>
    queryClient.invalidateQueries({
      queryKey: orpc.auth.allowedDomains.list.key(),
    });

  const create = useMutation({
    mutationFn: (input: { domain: string; defaultRole: UserRole }) =>
      orpc.auth.allowedDomains.create.call(input),
    onMutate: () => setServerError(null),
    onSuccess: async () => {
      await invalidateList();
      form.reset({ domain: "", defaultRole: "subscriber" });
    },
    onError: (err) => setServerError(mapError(err)),
  });

  const update = useMutation({
    mutationFn: (input: {
      domain: string;
      defaultRole?: UserRole;
      isEnabled?: boolean;
    }) => orpc.auth.allowedDomains.update.call(input),
    onSuccess: () => invalidateList(),
  });

  const remove = useMutation({
    mutationFn: (input: { domain: string }) =>
      orpc.auth.allowedDomains.delete.call(input),
    onSuccess: () => invalidateList(),
  });

  const form = useForm({
    resolver: valibotResolver(createFormSchema),
    defaultValues: { domain: "", defaultRole: "subscriber" as UserRole },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((value) => {
    create.mutate({ domain: value.domain, defaultRole: value.defaultRole });
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1
          className="text-2xl font-semibold"
          data-testid="allowed-domains-heading"
        >
          Allowed domains
        </h1>
        <p className="text-muted-foreground text-sm">
          Email domains permitted to sign up via OAuth. New OAuth accounts are
          created with the role set here. Disabled rows reject signup but
          preserve their role mapping.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-base font-semibold">Add domain</h2>
          </CardTitle>
          <CardDescription>
            Use the bare domain — no protocol, no path.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              className="flex flex-col gap-4 sm:flex-row sm:items-end"
              onSubmit={onSubmit}
            >
              <FormField
                control={form.control}
                name="domain"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Domain</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="example.com"
                        autoComplete="off"
                        spellCheck={false}
                        data-testid="allowed-domains-domain-input"
                        disabled={create.isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultRole"
                render={({ field }) => (
                  <FormItem className="sm:w-48">
                    <FormLabel>Default role</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={create.isPending}
                      >
                        <SelectTrigger data-testid="allowed-domains-role-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {USER_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABEL[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={create.isPending}
                data-testid="allowed-domains-add-button"
              >
                {create.isPending ? "Adding…" : "Add"}
              </Button>
            </form>
          </Form>
          {serverError ? (
            <Alert
              variant="destructive"
              className="mt-4"
              data-testid="allowed-domains-error"
            >
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-base font-semibold">Configured domains</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <p
              className="text-muted-foreground text-sm"
              data-testid="allowed-domains-loading"
            >
              Loading…
            </p>
          ) : (list.data ?? []).length === 0 ? (
            <p
              className="text-muted-foreground text-sm"
              data-testid="allowed-domains-empty"
            >
              No domains configured. OAuth signup is closed until at least one
              enabled domain is added.
            </p>
          ) : (
            <ul
              className="flex flex-col gap-2"
              data-testid="allowed-domains-list"
            >
              {(list.data ?? []).map((row) => (
                <DomainRow
                  key={row.domain}
                  row={row}
                  onToggle={(isEnabled) => {
                    update.mutate({ domain: row.domain, isEnabled });
                  }}
                  onChangeRole={(defaultRole) => {
                    update.mutate({ domain: row.domain, defaultRole });
                  }}
                  onDelete={() => {
                    remove.mutate({ domain: row.domain });
                  }}
                  busy={update.isPending || remove.isPending}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DomainRow({
  row,
  onToggle,
  onChangeRole,
  onDelete,
  busy,
}: {
  row: AllowedDomain;
  onToggle: (isEnabled: boolean) => void;
  onChangeRole: (role: UserRole) => void;
  onDelete: () => void;
  busy: boolean;
}): ReactNode {
  const [confirming, setConfirming] = useState(false);
  return (
    <li
      className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:gap-4"
      data-testid={`allowed-domains-row-${row.domain}`}
    >
      <span className="flex-1 font-mono text-sm">{row.domain}</span>
      <div className="flex items-center gap-2">
        <Select
          value={row.defaultRole}
          onValueChange={(value) => onChangeRole(value as UserRole)}
          disabled={busy}
        >
          <SelectTrigger
            className="w-44"
            data-testid={`allowed-domains-row-role-${row.domain}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {USER_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABEL[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Toggle
          variant="outline"
          size="sm"
          pressed={row.isEnabled}
          onPressedChange={onToggle}
          disabled={busy}
          data-testid={`allowed-domains-row-toggle-${row.domain}`}
        >
          {row.isEnabled ? "Enabled" : "Disabled"}
        </Toggle>
        {confirming ? (
          <>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirming(false);
                onDelete();
              }}
              disabled={busy}
              data-testid={`allowed-domains-row-delete-confirm-${row.domain}`}
            >
              Confirm delete
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={busy}
              data-testid={`allowed-domains-row-delete-cancel-${row.domain}`}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setConfirming(true)}
            disabled={busy}
            aria-label={`Delete ${row.domain}`}
            data-testid={`allowed-domains-row-delete-${row.domain}`}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

function mapError(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { reason?: string } }).data;
    if (data?.reason === "domain_exists") {
      return "That domain is already configured.";
    }
  }
  if (err instanceof Error) return err.message;
  return "Couldn't save the domain. Try again.";
}
