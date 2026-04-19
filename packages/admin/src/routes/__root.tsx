import type { ReactNode } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout(): ReactNode {
  return <Outlet />;
}
