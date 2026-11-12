import { defineBlock } from "plumix/blocks";

export const ratingBlock = defineBlock({
  name: "demo/rating",
  title: "Rating",
  icon: "Star",
  category: "text",
  inputs: [
    { name: "score", type: "number", label: "Score out of five" },
    {
      name: "symbol",
      type: "radio",
      label: "Symbol",
      options: [
        { label: "Stars", value: "star" },
        { label: "Hearts", value: "heart" },
      ],
    },
    { name: "label", type: "text", label: "Label" },
  ],
  defaults: { score: 3, symbol: "star", label: "" },
  view: () => import("./rating.view"),
});
