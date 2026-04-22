"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SidebarNavItem, NavGroup, SlotRenderer } from "./types";

/** Resolve a SlotRenderer to a ReactNode given the current collapsed state. */
function resolveSlot(
  slot: SlotRenderer | undefined,
  collapsed: boolean,
): React.ReactNode {
  if (slot == null) return null;
  if (typeof slot === "function") return slot({ collapsed });
  return slot;
}

interface SidebarProps {
  /** Flat list of items (backward-compat). Ignored when `groups` is provided. */
  items?: SidebarNavItem[];
  /** Grouped nav structure. When provided, takes precedence over `items`. */
  groups?: NavGroup[];
  collapsed: boolean;
  onToggle: () => void;
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
  logo?: React.ReactNode;
  /** Rendered above the nav list (e.g. ProjectSwitcher). */
  headerSlot?: SlotRenderer;
  /** Rendered below the nav list (e.g. user info + LogOut). */
  footerSlot?: SlotRenderer;
  /** Override active pathname (defaults to usePathname()). */
  activePathname?: string;
  /** Optional item filter applied before render (e.g. role-based filtering). */
  filterItem?: (item: SidebarNavItem) => boolean;
}

export function Sidebar({
  items = [],
  groups,
  collapsed,
  onToggle,
  isMobile,
  isOpen,
  onClose,
  logo,
  headerSlot,
  footerSlot,
  activePathname,
  filterItem,
}: SidebarProps) {
  const pathnameFromHook = usePathname();
  const pathname = activePathname ?? pathnameFromHook;

  // Resolve nav structure: groups mode vs flat items mode
  const resolvedGroups: NavGroup[] | null = groups
    ? groups.map((g) => ({
        ...g,
        items: filterItem ? g.items.filter(filterItem) : g.items,
      })).filter((g) => g.items.length > 0)
    : null;

  const resolvedItems: SidebarNavItem[] = resolvedGroups
    ? []
    : filterItem ? items.filter(filterItem) : items;

  function renderItem(item: SidebarNavItem) {
    const Icon = item.icon;
    const active = pathname === item.href || pathname?.startsWith(item.href + "/");
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={isMobile ? onClose : undefined}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            active
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {Icon ? <Icon className="size-4 shrink-0" /> : null}
          <span className={cn(collapsed && !isMobile && "hidden")}>
            {item.label}
          </span>
        </Link>
      </li>
    );
  }

  const content = (
    <nav className="flex h-full flex-col bg-card border-r border-border">
      {/* Logo / collapse toggle header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border">
        <div className={cn("flex items-center gap-2", collapsed && !isMobile && "hidden")}>
          {logo ?? (
            <span className="font-mono text-sm font-semibold text-primary">wingx</span>
          )}
        </div>
        {isMobile ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="p-1 rounded hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="p-1 rounded hover:bg-muted"
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </button>
        )}
      </div>

      {/* Header slot (e.g. ProjectSwitcher) */}
      {headerSlot ? <div>{resolveSlot(headerSlot, collapsed)}</div> : null}

      {/* Nav list — groups mode or flat mode */}
      <div className="flex-1 overflow-auto py-2 px-2 space-y-3">
        {resolvedGroups
          ? resolvedGroups.map((group) => (
              <div key={group.label}>
                {!collapsed || isMobile ? (
                  <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {group.label}
                  </p>
                ) : null}
                <ul className="space-y-1">
                  {group.items.map(renderItem)}
                </ul>
              </div>
            ))
          : (
            <ul className="space-y-1">
              {resolvedItems.map(renderItem)}
            </ul>
          )}
      </div>

      {/* Footer slot (e.g. user info + LogOut) */}
      {footerSlot ? <div className="border-t border-border">{resolveSlot(footerSlot, collapsed)}</div> : null}
    </nav>
  );

  if (isMobile) {
    return (
      <>
        {isOpen ? (
          <>
            <div
              className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
              onClick={onClose}
              aria-hidden="true"
            />
            <aside className="fixed inset-y-0 left-0 z-50 w-60">{content}</aside>
          </>
        ) : null}
      </>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 transition-[width] duration-200"
      style={{ width: collapsed ? "4rem" : "15rem" }}
    >
      {content}
    </aside>
  );
}
