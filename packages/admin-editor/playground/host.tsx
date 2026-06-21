import type { Messages } from "@lingui/core";
import type { ReactElement } from "react";
import { StrictMode } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { createRoot } from "react-dom/client";

import {
  coreBlocks,
  createBlockRegistry,
  defineEntryContent,
} from "@plumix/blocks";

import { PlumixEditor } from "../src/plumix-editor.js";
import { SEED_BLOCKS } from "./seed.js";

import "./playground.css";

// Load the package's compiled catalogs, exactly as the admin shell does. A
// production build (what e2e previews) won't runtime-compile a raw default
// message, so an empty catalog would render ICU like "{count} selected"
// literally — loading the compiled `en` catalog keeps the harness faithful.
// `playground`/`playground:build` run `plumix-compile-catalogs` first.
const CATALOGS = import.meta.glob<{ messages: Messages }>("../locales/*.mjs", {
  eager: true,
});
i18n.load("en", CATALOGS["../locales/en.mjs"]?.messages ?? {});
i18n.activate("en");

const registry = createBlockRegistry(coreBlocks);

function DocumentPanelStub(): ReactElement {
  return (
    <div
      className="space-y-2 p-4 text-sm"
      data-testid="playground-document-panel"
    >
      <p className="text-muted-foreground">
        Document settings live in the admin app (slug, excerpt, parent,
        metaboxes). This playground stubs the slot.
      </p>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <PlumixEditor
          previewUrl="./canvas.html"
          origin={window.location.origin}
          registry={registry}
          defaultValue={defineEntryContent(SEED_BLOCKS)}
          capabilities={new Set()}
          documentPanel={<DocumentPanelStub />}
          publish={{
            onPublish: () => console.info("[playground] publish"),
            isPublished: false,
          }}
          onChange={(content) =>
            console.info(
              "[playground] onChange",
              content.blocks.length,
              "blocks",
            )
          }
        />
      </I18nProvider>
    </StrictMode>,
  );
}
