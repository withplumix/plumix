import type { ReactNode } from "react";
import { useState } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

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

  return (
    <I18nProvider i18n={i18n}>
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
    </I18nProvider>
  );
}
