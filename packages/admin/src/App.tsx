import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { createQueryClient } from "./query-client.js";
import { createRouter } from "./router.js";

const IS_DEV = process.env.NODE_ENV === "development";

export function App(): React.ReactNode {
  // Lazy init via useState keeps singletons stable without being module-level —
  // module-level creation breaks StrictMode double-invoke and test teardown.
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createRouter);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {IS_DEV ? (
        <>
          <TanStackRouterDevtools router={router} />
          <ReactQueryDevtools initialIsOpen={false} />
        </>
      ) : null}
    </QueryClientProvider>
  );
}
