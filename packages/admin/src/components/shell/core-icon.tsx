import type { ReactNode } from "react";

import type { LucideIcon } from "@plumix/admin-ui/icons";
import type { CoreIconName } from "@plumix/core/manifest";
import {
  Calendar,
  FileText,
  Folder,
  Image,
  Key,
  Layout,
  LayoutDashboard,
  Mail,
  Puzzle,
  Settings,
  Tag,
  Users,
} from "@plumix/admin-ui/icons";

const CORE_ICON: Record<CoreIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  content: FileText,
  "file-text": FileText,
  layout: Layout,
  image: Image,
  calendar: Calendar,
  tag: Tag,
  folder: Folder,
  users: Users,
  settings: Settings,
  puzzle: Puzzle,
  mail: Mail,
  key: Key,
};

/** Renders the lucide icon for a core nav-icon name; falls back to the
 *  generic plugin icon for plugin-contributed items (no `coreIcon`). */
export function CoreIcon({ name }: { name?: CoreIconName }): ReactNode {
  const Icon = name ? CORE_ICON[name] : Puzzle;
  return <Icon />;
}
