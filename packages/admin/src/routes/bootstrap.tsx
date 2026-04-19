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
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { getPasskeyErrorMessage, PasskeyError } from "@/lib/passkey-errors.js";
import { registerWithPasskey } from "@/lib/passkey.js";
import { SESSION_QUERY_KEY, sessionQueryOptions } from "@/lib/session.js";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/bootstrap")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(),
    );
    /* eslint-disable @typescript-eslint/only-throw-error -- TanStack Router redirect pattern */
    if (session.user) throw redirect({ to: "/" });
    // Once someone's claimed the bootstrap slot, /bootstrap becomes /login
    // to avoid a dead-end UX; the server would reject with registration_closed
    // regardless.
    if (!session.needsBootstrap) throw redirect({ to: "/login" });
    /* eslint-enable @typescript-eslint/only-throw-error */
  },
  component: BootstrapRoute,
});

function BootstrapRoute(): ReactNode {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const createAccount = useMutation({
    mutationFn: () =>
      registerWithPasskey({
        email: email.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
      }),
    onMutate: () => setErrorCode(null),
    onSuccess: async () => {
      await router.options.context.queryClient.invalidateQueries({
        queryKey: SESSION_QUERY_KEY,
      });
      await router.navigate({ to: "/" });
    },
    onError: (err) => {
      setErrorCode(err instanceof PasskeyError ? err.code : "unknown");
    },
  });

  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1>Create admin account</h1>
          </CardTitle>
          <CardDescription>
            Set up your site — this email becomes the admin account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              createAccount.mutate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username webauthn"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={createAccount.isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">
                Name <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={createAccount.isPending}
              />
            </div>
            {errorCode ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {getPasskeyErrorMessage(errorCode as never)}
                </AlertDescription>
              </Alert>
            ) : null}
            <Button
              type="submit"
              disabled={createAccount.isPending || !email.trim()}
            >
              {createAccount.isPending
                ? "Creating account…"
                : "Create account with passkey"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
