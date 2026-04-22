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
