import type { ComponentData, Data } from "@puckeditor/core";

import { PUCK_ROOT_ZONE } from "./puck-zones.js";

interface MergeSelector {
  readonly zone: string;
  readonly index: number;
}

export function mergePropsAtSelector(
  data: Data,
  selector: MergeSelector,
  attrs: Readonly<Record<string, unknown>>,
): Data {
  if (selector.zone === PUCK_ROOT_ZONE) {
    return {
      ...data,
      content: mergeAtIndex(data.content, selector.index, attrs),
    };
  }
  const [parentId, slotName] = selector.zone.split(":", 2) as [string, string];
  return {
    ...data,
    content: data.content.map((item) =>
      mergeInSlot(item, parentId, slotName, selector.index, attrs),
    ),
  };
}

function mergeInSlot(
  item: ComponentData,
  parentId: string,
  slotName: string,
  index: number,
  attrs: Readonly<Record<string, unknown>>,
): ComponentData {
  const props = item.props as Record<string, unknown>;
  if (props.id === parentId) {
    const slot = props[slotName];
    if (!isComponentDataArray(slot)) return item;
    return {
      ...item,
      props: {
        ...props,
        [slotName]: mergeAtIndex(slot, index, attrs),
      } as ComponentData["props"],
    };
  }
  let nextProps: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(props)) {
    if (!isComponentDataArray(value)) continue;
    const recursed = value.map((child) =>
      mergeInSlot(child, parentId, slotName, index, attrs),
    );
    if (recursed.some((child, i) => child !== value[i])) {
      nextProps ??= { ...props };
      nextProps[key] = recursed;
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

function mergeAtIndex(
  list: readonly ComponentData[],
  index: number,
  attrs: Readonly<Record<string, unknown>>,
): ComponentData[] {
  return list.map((item, i) =>
    i === index ? { ...item, props: { ...item.props, ...attrs } } : item,
  );
}
