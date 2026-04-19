import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import { createQueryClient } from "./query-client.js";
import { createRouter } from "./router.js";

export function App(): React.ReactNode {
  // useState keeps both singletons stable across renders without being
  // module-level (module-level creation breaks under React.StrictMode in
  // dev and blocks clean teardown in tests).
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createRouter);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
