import type { RegisteredAdminBarNode } from "../plugin/admin-bar-node.js";

export type { BarRenderContext } from "../plugin/admin-bar-node.js";

/** A registered node as this request's bar shows it. */
export interface AdminBarNode extends Pick<
  RegisteredAdminBarNode,
  "id" | "group" | "parent" | "position" | "action"
> {
  readonly title: string;
  readonly href?: string;
}

export interface AdminBarTreeNode extends AdminBarNode {
  readonly children: readonly AdminBarTreeNode[];
}
