import type { ReactNode } from "react";
import { useState } from "react";
import { useDir } from "@/lib/use-dir.js";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Direction } from "radix-ui";

import {
  createQueryClient,
  createRouter,
  ThemeProvider,
} from "./providers/index.js";

const IS_DEV = process.env.NODE_ENV === "development";

export function App(): ReactNode {
  // Lazy init via useState keeps singletons stable without being module-level —
  // module-level creation breaks StrictMode double-invoke and test teardown.
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(() => createRouter(queryClient));

  // Radix's `dir` fallback chain skips `<html dir>`. Import from the `radix-ui`
  // umbrella: the standalone package can be a separate React context, silently
  // forcing LTR.
  return (
    <I18nProvider i18n={i18n}>
      <Direction.DirectionProvider dir={useDir()}>
        <ThemeProvider defaultTheme="system">
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
            {IS_DEV ? (
              <>
                <TanStackRouterDevtools router={router} />
                <ReactQueryDevtools initialIsOpen={false} />
              </>
            ) : null}
          </QueryClientProvider>
        </ThemeProvider>
      </Direction.DirectionProvider>
    </I18nProvider>
  );
}
