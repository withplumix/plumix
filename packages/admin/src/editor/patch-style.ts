import type { ComponentData, Data } from "@puckeditor/core";

import type { ResponsiveStyleSlot } from "@plumix/blocks";

import { PUCK_ROOT_ZONE } from "./puck-zones.js";

interface PatchSelector {
  readonly index: number;
  readonly zone?: string;
}

export function patchStyleAtSelector(
  data: Data,
  selector: PatchSelector,
  nextStyle: ResponsiveStyleSlot | undefined,
): Data {
  const zone = selector.zone ?? PUCK_ROOT_ZONE;
  if (zone === PUCK_ROOT_ZONE) {
    return {
      ...data,
      content: patchItemAtIndex(data.content, selector.index, nextStyle),
    };
  }
  const [parentId, slotName] = zone.split(":", 2) as [string, string];
  return {
    ...data,
    content: data.content.map((item) =>
      patchInSlot(item, parentId, slotName, selector.index, nextStyle),
    ),
  };
}

function patchInSlot(
  item: ComponentData,
  parentId: string,
  slotName: string,
  index: number,
  nextStyle: ResponsiveStyleSlot | undefined,
): ComponentData {
  const props = item.props as Record<string, unknown>;
  if (props.id === parentId) {
    const slot = props[slotName];
    if (!isComponentDataArray(slot)) return item;
    return {
      ...item,
      props: {
        ...props,
        [slotName]: patchItemAtIndex(slot, index, nextStyle),
      } as ComponentData["props"],
    };
  }
  let nextProps: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(props)) {
    if (!isComponentDataArray(value)) continue;
    const patched = value.map((child) =>
      patchInSlot(child, parentId, slotName, index, nextStyle),
    );
    if (patched.some((child, i) => child !== value[i])) {
      nextProps ??= { ...props };
      nextProps[key] = patched;
    }
  }
  return nextProps
    ? { ...item, props: nextProps as ComponentData["props"] }
    : item;
}

function isComponentDataArray(
  value: unknown,
): value is readonly ComponentData[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { type?: unknown }).type === "string" &&
        typeof (item as { props?: unknown }).props === "object",
    )
  );
}

function patchItemAtIndex(
  list: readonly ComponentData[],
  index: number,
  nextStyle: ResponsiveStyleSlot | undefined,
): ComponentData[] {
  return list.map((item, i) => {
    if (i !== index) return item;
    const nextProps: Record<string, unknown> = { ...item.props };
    if (nextStyle === undefined) {
      delete nextProps.style;
    } else {
      nextProps.style = nextStyle;
    }
    return { ...item, props: nextProps as ComponentData["props"] };
  });
}
