import type { ReactNode } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { readManifest } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { Trans } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";

interface LanguageCardProps {
  readonly userLocale: unknown;
}

export function LanguageCard({ userLocale }: LanguageCardProps): ReactNode {
  const manifest = readManifest();
  const currentCode =
    typeof userLocale === "string"
      ? userLocale
      : (manifest.i18n?.defaultLocale ?? "en");
  const setLocale = useMutation({
    mutationFn: (code: string) => orpc.user.setLocale.call({ code }),
    onSuccess: () => window.location.reload(),
  });

  return (
    <Card data-testid="language-card">
      <CardHeader>
        <CardTitle>
          <Trans id="profile.language.title" message="Language" />
        </CardTitle>
        <CardDescription>
          <Trans
            id="profile.language.description"
            message="Your admin chrome renders in this language. The page reloads after you switch so the new translations apply everywhere."
          />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <LocaleSwitcher
          currentCode={currentCode}
          manifest={manifest}
          onSelect={setLocale.mutate}
        />
        {setLocale.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              <Trans
                id="profile.language.error"
                message="Couldn't switch language. Please try again."
              />
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
