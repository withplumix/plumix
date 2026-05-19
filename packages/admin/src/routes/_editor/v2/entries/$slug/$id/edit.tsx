import type { Config, Data } from "@puckeditor/core";
import type { ReactNode } from "react";
import { Puck } from "@puckeditor/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

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

export const Route = createFileRoute("/_editor/v2/entries/$slug/$id/edit")({
  component: PuckSpikeRoute,
});

function PuckSpikeRoute(): ReactNode {
  const [data, setData] = useState<Data>(initialData);

  return (
    <Puck
      config={config}
      data={data}
      onPublish={setData}
      onChange={setData}
    />
  );
}
