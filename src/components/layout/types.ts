import type { LucideIcon } from "lucide-react";

export interface SidebarNavItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  /** Optional role field for consumer-side filtering (e.g. minRole in MC). */
  minRole?: string;
}

export interface NavGroup {
  label: string;
  items: SidebarNavItem[];
}

/** Collapsed-state context passed to render-prop slots. */
export interface SlotContext {
  collapsed: boolean;
}

/**
 * Slot prop type for AdminLayout headerSlot / footerSlot.
 * Accepts either a plain ReactNode (backward-compat) or a render-prop
 * function receiving `{ collapsed }` so the slot can adapt its layout.
 */
export type SlotRenderer =
  | React.ReactNode
  | ((ctx: SlotContext) => React.ReactNode);
