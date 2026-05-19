import type { ThemeTokens } from "@plumix/blocks";
import type { Config, Data } from "@puckeditor/core";
import type { ReactElement, ReactNode } from "react";
import { Puck } from "@puckeditor/core";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { PlumixEditorLayout } from "@/editor/v2/EditorLayout.js";

import "@puckeditor/core/puck.css";

interface HeadingProps {
  readonly text: string;
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
}

const config: Config<{ Heading: HeadingProps }> = {
  components: {
    Heading: {
      label: "Heading",
      fields: {
        text: { type: "text" },
        level: {
          type: "select",
          options: [
            { label: "H1", value: 1 },
            { label: "H2", value: 2 },
            { label: "H3", value: 3 },
            { label: "H4", value: 4 },
            { label: "H5", value: 5 },
            { label: "H6", value: 6 },
          ],
        },
      },
      defaultProps: { text: "Hello, Puck", level: 2 },
      render: ({ text, level }) => {
        const Tag = `h${level}` as const;
        return <Tag>{text}</Tag>;
      },
    },
  },
};

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

export const Route = createFileRoute("/_editor/v2/entries/$slug/$id/edit")({
  component: PuckSpikeRoute,
});

function PuckSpikeRoute(): ReactNode {
  const [data, setData] = useState<Data>(initialData);
  const Layout = useCallback(
    (): ReactElement => <PlumixEditorLayout tokens={sampleTokens} />,
    [],
  );

  return (
    <Puck
      config={config}
      data={data}
      onPublish={setData}
      onChange={setData}
      iframe={{ enabled: false }}
      overrides={{ puck: Layout }}
    />
  );
}
