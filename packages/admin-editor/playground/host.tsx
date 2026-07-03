import type { Messages } from "@lingui/core";
import type { ReactElement } from "react";
import { StrictMode } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { createRoot } from "react-dom/client";

import type { BlockSpec } from "@plumix/blocks";
import {
  coreBlocks,
  createBlockRegistry,
  defineEntryContent,
} from "@plumix/blocks";

import { PlumixEditor } from "../src/plumix-editor.js";
import { feedSpec } from "./feed-block.js";
import { SEED_BLOCKS, SEED_PATTERNS } from "./seed.js";

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

// Core blocks ship no variations, so augment core/group with an inserter
// variation here — the harness needs one to exercise the catalog's
// blocks-plus-variations rendering.
const withVariations = coreBlocks.map((spec): BlockSpec =>
  spec.name === "core/group"
    ? {
        ...spec,
        variations: [
          {
            slug: "group/two-column",
            title: "Two-column group",
            innerBlocks: [
              { id: "col-a", name: "core/rich-text" },
              { id: "col-b", name: "core/rich-text" },
            ],
          },
        ],
      }
    : spec,
);
const registry = createBlockRegistry([...withVariations, feedSpec]);

// Seed theme tokens so the Styles tab's token-or-custom controls have options.
const SEED_TOKENS = {
  color: {
    primary: { value: "#2563eb", label: "Primary" },
    ink: { value: "#0c2238", label: "Ink" },
  },
  spacing: { sm: { value: "8px" }, lg: { value: "24px" } },
  fontFamily: { sans: { value: "system-ui, sans-serif", label: "Sans" } },
  borderRadius: { md: { value: "8px" } },
  boxShadow: { lg: { value: "0 4px 12px rgba(0,0,0,0.1)" } },
} as const;

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

const params = new URLSearchParams(window.location.search);
// `?theme=dark` flips the shell into dark mode so the editor (and the Tiptap
// rail) can be exercised + screenshotted in both themes against one build.
if (params.get("theme") === "dark") {
  document.documentElement.classList.add("dark");
}
// `?readonly` exercises preview mode: read-only canvas, editing chrome hidden,
// a host-supplied banner standing in for the revision/restore overlay.
const readOnly = params.has("readonly");

// A stand-in for the admin's revision/share preview banner.
function PreviewBannerStub(): ReactElement {
  return (
    <div
      className="bg-muted text-muted-foreground flex items-center justify-between border-b px-4 py-2 text-sm"
      data-testid="playground-preview-banner"
    >
      <span>Previewing a past revision (read-only)</span>
      <button
        type="button"
        className="bg-primary text-primary-foreground rounded-md px-3 py-1 text-xs"
        data-testid="playground-restore"
        onClick={() => console.info("[playground] restore")}
      >
        Restore this revision
      </button>
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
          patterns={SEED_PATTERNS}
          tokens={SEED_TOKENS}
          readOnly={readOnly}
          previewBanner={readOnly ? <PreviewBannerStub /> : undefined}
          previewLink="https://example.test/blog/hello?preview=demo-token"
          documentPanel={<DocumentPanelStub />}
          onRefreshBlockLoader={(blockId) =>
            Promise.resolve({ [blockId]: { items: { label: "refreshed" } } })
          }
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
