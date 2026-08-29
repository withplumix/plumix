"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h, useState, useSyncExternalStore } from "react";

import type { FormWire } from "@plumix/plugin-forms/hooks";
import { usePlumixForm } from "@plumix/plugin-forms/hooks";

// A theme's own subscribe bar, and the reason `usePlumixForm`
// exists: one input, one button, and markup that is entirely the
// theme's — none of the plugin's classes, attributes or stylesheet. The
// hook supplies the fields, the submit and the errors; everything else
// here is ordinary React.
//
// Authored with `createElement` rather than JSX, like the theme beside
// it, so the playground stays transform-agnostic across the jiti config
// load and the vite worker bundle.
const NEVER_CHANGES = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

export function SubscribeBar({
  form,
}: IslandProps<{ readonly form: FormWire }>): ReactNode {
  const subscribe = usePlumixForm(form);
  const [address, setAddress] = useState("");
  // The bar's own equivalent of `data-plumix-form-enhanced`: its server
  // render is on the page before the island driving it has hydrated, so
  // without a marker of its own there is nothing to tell a visitor — or
  // the e2e suite — that the button is live yet. A theme wanting that
  // signal writes it, since none of the plugin's markup is here to carry
  // it. The store never changes: the two snapshots differ only in where
  // they are read, which is how a component tells "rendered on the
  // server" from "running in a browser" without a state update in an
  // effect.
  const live = useSyncExternalStore(NEVER_CHANGES, onClient, onServer);

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
