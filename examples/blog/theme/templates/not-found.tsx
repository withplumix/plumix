import * as React from "react";
import { defineTemplate } from "plumix";
import type { ErrorData } from "plumix";
import { hasDemoSession } from "@plumix/runtime-cloudflare/demo";

import { Layout } from "../components/Layout";
import { NotFound } from "../components/NotFound";

export const notFound = defineTemplate<ErrorData>({
  settings: ["site"],
  menus: ["primary", "footer"],
  render: ({ settings, menus, ctx }) => (
    <Layout
      settings={settings}
      menus={menus}
      showTryEditor={!hasDemoSession(ctx.request)}
    >
      <NotFound />
    </Layout>
  ),
});
