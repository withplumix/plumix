import type { BlockNode, ResponsiveStyleSlot } from "@plumix/blocks";
import type { Data } from "@puckeditor/core";

interface PuckComponentDataLike {
  readonly type: string;
  readonly props: Readonly<Record<string, unknown>>;
}

function isPuckComponentDataArray(
  value: unknown,
): value is readonly PuckComponentDataLike[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { readonly type?: unknown }).type === "string" &&
        typeof (item as { readonly props?: unknown }).props === "object",
    )
  );
}

function toBlockNode(
  item: PuckComponentDataLike,
  fallbackId: string,
): BlockNode {
  const rawId = item.props.id;
  const id =
    typeof rawId === "string" && rawId.length > 0 ? rawId : fallbackId;
  const attrs: Record<string, unknown> = {};
  let style: ResponsiveStyleSlot | undefined;
  for (const [key, value] of Object.entries(item.props)) {
    if (key === "style") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        style = value;
      }
      continue;
    }
    if (isPuckComponentDataArray(value)) {
      attrs[key] = value.map((child, idx) =>
        toBlockNode(child, `${id}-${key}-${idx}`),
      );
    } else {
      attrs[key] = value;
    }
  }
  return style ? { id, name: item.type, attrs, style } : { id, name: item.type, attrs };
}

export function puckDataToBlockTree(
  data: Pick<Data, "content">,
): readonly BlockNode[] {
  return data.content.map((item, idx) =>
    toBlockNode(item as PuckComponentDataLike, `puck-${idx}`),
  );
}
