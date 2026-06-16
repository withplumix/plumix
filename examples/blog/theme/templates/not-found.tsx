import * as React from "react";
import { defineTemplate } from "plumix";
import type { ErrorData } from "plumix";

import { Layout } from "../components/Layout";
import { NotFound } from "../components/NotFound";

export const notFound = defineTemplate<ErrorData>({
  settings: ["site"],
  menus: ["primary", "footer"],
  render: ({ settings, menus }) => (
    <Layout settings={settings} menus={menus}>
      <NotFound />
    </Layout>
  ),
});
