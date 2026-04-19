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
import { signInWithPasskey } from "@/lib/passkey.js";
import { SESSION_QUERY_KEY, sessionQueryOptions } from "@/lib/session.js";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(),
    );
    /* eslint-disable @typescript-eslint/only-throw-error -- TanStack Router redirect pattern */
    if (session.user) throw redirect({ to: "/" });
    if (session.needsBootstrap) throw redirect({ to: "/bootstrap" });
    /* eslint-enable @typescript-eslint/only-throw-error */
  },
  component: LoginRoute,
});

function LoginRoute(): ReactNode {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const signIn = useMutation({
    mutationFn: () => signInWithPasskey(email.trim() || undefined),
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
            <h1>Sign in</h1>
          </CardTitle>
          <CardDescription>
            Use a passkey registered with this site.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              signIn.mutate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">
                Email <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username webauthn"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={signIn.isPending}
              />
            </div>
            {errorCode ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {getPasskeyErrorMessage(errorCode as never)}
                </AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={signIn.isPending}>
              {signIn.isPending ? "Signing in…" : "Sign in with passkey"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
