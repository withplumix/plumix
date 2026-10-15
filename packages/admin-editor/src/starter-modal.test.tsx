import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { StarterThumbnail } from "./starter-modal.js";

describe("StarterThumbnail", () => {
  test("a pattern's declared preview renders at its declared dimensions", () => {
    const html = renderToStaticMarkup(
      <StarterThumbnail
        pattern={{
          name: "starter/shot",
          title: "Shot",
          content: [],
          preview: {
            src: "/shot.png",
            width: 320,
            height: 180,
            alt: "Hero preview",
          },
        }}
      />,
    );

    expect(html).toMatch(
      /<img src="\/shot.png" width="320" height="180" alt="Hero preview"/,
    );
  });

  test("a pattern without a preview shows a placeholder, not an image", () => {
    const html = renderToStaticMarkup(
      <StarterThumbnail
        pattern={{ name: "starter/hero", title: "Hero", content: [] }}
      />,
    );

    expect(html).not.toContain("<img");
  });
});
