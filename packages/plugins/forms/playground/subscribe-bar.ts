"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h, useState } from "react";
import { useIsLive } from "plumix/blocks/renderer";

import type { FormWire } from "@plumix/plugin-forms/hooks";
import { usePlumixForm } from "@plumix/plugin-forms/hooks";

/**
 * A theme-owned subscribe bar driven by `usePlumixForm`, free of the plugin's
 * markup. `createElement`, not JSX, keeps it transform-agnostic across jiti and
 * the vite worker bundle.
 */
export function SubscribeBar({
  form,
}: IslandProps<{ readonly form: FormWire }>): ReactNode {
  const subscribe = usePlumixForm(form);
  const [address, setAddress] = useState("");
  // Hydration marker of its own: none of the plugin's markup is here to carry
  // `data-plumix-form-enhanced`.
  const live = useIsLive();

  if (subscribe.confirmation !== null) {
    return h("p", { "data-testid": "subscribed" }, subscribe.confirmation);
  }

  return h(
    "div",
    { "data-testid": "subscribe-bar", "data-live": live ? "" : undefined },
    h("input", {
      "data-testid": "subscribe-email",
      type: "email",
      value: address,
      onChange: (event: { target: { value: string } }) => {
        setAddress(event.target.value);
      },
    }),
    h(
      "button",
      {
        "data-testid": "subscribe-send",
        type: "button",
        disabled: subscribe.submitting,
        onClick: () => {
          void subscribe.submit({ email: address });
        },
      },
      "Subscribe",
    ),
    subscribe.errorFor("email") === undefined
      ? null
      : h(
          "p",
          { "data-testid": "subscribe-error" },
          subscribe.errorFor("email"),
        ),
  );
}
