import type { ThemeTokens } from "@plumix/blocks";
import type { Config, Data } from "@puckeditor/core";
import type { ReactElement, ReactNode } from "react";
import { coreBlocksV2, createBlockRegistry } from "@plumix/blocks";
import { Puck } from "@puckeditor/core";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { blockSpecsToPuckComponents } from "@/editor/v2/block-adapter.js";
import { PlumixEditorLayout } from "@/editor/v2/EditorLayout.js";
import { readDraft, writeDraft } from "@/editor/v2/local-draft.js";

import "@puckeditor/core/puck.css";

const initialData: Data = { content: [], root: {} };

const sampleTokens: ThemeTokens = {
  colors: {
    background: { value: "#ffffff", label: "Background" },
    surface: { value: "#f4f4f5", label: "Surface" },
    brand: { value: "#0070f3", label: "Brand" },
    ink: { value: "#111111", label: "Ink" },
  },
  spacing: {
    none: { value: "0", label: "None" },
    sm: { value: "0.5rem", label: "Small" },
    md: { value: "1rem", label: "Medium" },
    lg: { value: "2rem", label: "Large" },
  },
  typography: {
    sm: { value: "0.875rem", label: "Small" },
    md: { value: "1rem", label: "Medium" },
    lg: { value: "1.25rem", label: "Large" },
    xl: { value: "1.5rem", label: "Extra large" },
  },
};

const registry = createBlockRegistry(coreBlocksV2);
const config: Config = {
  components: blockSpecsToPuckComponents(coreBlocksV2),
};

export const Route = createFileRoute("/_editor/v2/entries/$slug/$id/edit")({
  component: PuckSpikeRoute,
});

function PuckSpikeRoute(): ReactNode {
  const { slug, id } = Route.useParams();
  const draftKey = `plumix.v2.draft.${slug}.${id}`;
  return <PuckSpikeRouteInner key={draftKey} draftKey={draftKey} />;
}

interface PuckSpikeRouteInnerProps {
  readonly draftKey: string;
}

function PuckSpikeRouteInner({ draftKey }: PuckSpikeRouteInnerProps): ReactNode {
  const [data, setData] = useState<Data>(() => readDraft(draftKey) ?? initialData);
  const handleChange = useCallback(
    (next: Data): void => {
      setData(next);
      writeDraft(draftKey, next);
    },
    [draftKey],
  );
  const Layout = useCallback(
    (): ReactElement => (
      <PlumixEditorLayout registry={registry} tokens={sampleTokens} />
    ),
    [],
  );

  return (
    <Puck
      config={config}
      data={data}
      onPublish={handleChange}
      onChange={handleChange}
      iframe={{ enabled: false }}
      overrides={{ puck: Layout }}
    />
  );
}
