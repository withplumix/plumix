// The shared icon set — the single owner of which lucide icons ship in the
// admin/editor bundle. We deliberately DON'T `export *`: a namespace re-export
// plus the runtime name→component lookup in <BlockIcon> defeats tree-shaking
// and pulls the entire ~3,900-icon library (~600 KB) into the editor chunk.
// Instead every icon is named explicitly, so bundlers keep only these.
//
// Two access shapes, one curated list:
//   1. Named re-exports below — `import { Trash2 } from "@plumix/admin-ui/icons"`
//      for components that reference an icon statically. The compiler enforces
//      this set: importing an un-exported icon is a build error.
//   2. `blockIcons` — the name→component map <BlockIcon> resolves a block's
//      `icon: "Heading"` string against, since that name is only known at
//      runtime and can't be statically imported per-use.
import type { LucideIcon } from "lucide-react";
// Bindings for the blockIcons map (block-declared icons, resolved by string).
import {
  AlignLeft,
  ChevronDown,
  Code,
  Columns,
  File,
  Group,
  Image,
  Images,
  List,
  ListOrdered,
  Megaphone,
  Minus,
  MousePointerClick,
  Music,
  Rows,
  Square,
  Table,
  Type,
  Video,
} from "lucide-react";

export type { LucideIcon };

// Statically-referenced icons (admin + admin-editor components).
export {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Bold,
  Calendar,
  Check,
  ChevronDownIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ClipboardPaste,
  Code2,
  Copy,
  CopyPlus,
  CornerLeftUp,
  Eye,
  EyeIcon,
  EyeOff,
  FileText,
  Folder,
  Globe,
  GripVertical,
  Group,
  Highlighter,
  Image,
  Italic,
  Key,
  Layout,
  LayoutDashboard,
  Link2,
  Link2Icon,
  List,
  ListOrdered,
  LogOut,
  Mail,
  MessageCircle,
  MessageCircleMore,
  Monitor,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  PlusIcon,
  Puzzle,
  Quote,
  Redo2,
  RefreshCw,
  RemoveFormatting,
  Search,
  Settings,
  SettingsIcon,
  Smartphone,
  Square,
  SquareDashed,
  Strikethrough,
  Subscript,
  Superscript,
  Tablet,
  Tag,
  Trash2,
  TriangleAlert,
  Tv,
  Underline,
  Undo2,
  Ungroup,
  User,
  UserPlus,
  Users,
  Watch,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

// Block-declared icons. <BlockIcon> looks names up here at render time. Add an
// entry when a block ships a new `icon: "..."`.
export const blockIcons = {
  AlignLeft,
  ChevronDown,
  Code,
  Columns,
  File,
  Group,
  Image,
  Images,
  List,
  ListOrdered,
  Megaphone,
  Minus,
  MousePointerClick,
  Music,
  Rows,
  Table,
  Type,
  Video,
} satisfies Record<string, LucideIcon>;

export const fallbackBlockIcon = Square;
