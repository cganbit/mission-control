"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { MobileHeader } from "./MobileHeader";
import type { SidebarNavItem, NavGroup } from "./types";

export interface AdminLayoutProps {
  /** Flat nav items (backward-compat). Ignored when `groups` is provided. */
  items?: SidebarNavItem[];
  children: React.ReactNode;
  logo?: React.ReactNode;
  storageKey?: string;
  /** Grouped nav structure. When present, takes precedence over `items`. */
  groups?: NavGroup[];
  /** Rendered at the top of the sidebar, above the nav (e.g. ProjectSwitcher). */
  headerSlot?: React.ReactNode;
  /** Rendered at the bottom of the sidebar, below the nav (e.g. user info + LogOut). */
  footerSlot?: React.ReactNode;
  /** Override active pathname for nav highlighting (defaults to usePathname inside Sidebar). */
  activePathname?: string;
  /** Per-item filter for role-based visibility. Return false to hide an item. */
  filterItem?: (item: SidebarNavItem) => boolean;
  /** Optional logo/brand shown in MobileHeader (overrides `logo` for mobile). */
  mobileLogo?: React.ReactNode;
}

export function AdminLayout({
  items = [],
  children,
  logo,
  storageKey = "wingx-sidebar",
  groups,
  headerSlot,
  footerSlot,
  activePathname,
  filterItem,
  mobileLogo,
}: AdminLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (saved === "1") setCollapsed(true);
  }, [storageKey]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // ignore — private mode, quota, etc.
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {isMobile ? (
        <MobileHeader onMenuClick={() => setSidebarOpen(true)} logo={mobileLogo ?? logo} />
      ) : null}
      <Sidebar
        items={items}
        groups={groups}
        collapsed={collapsed}
        onToggle={toggle}
        isMobile={isMobile}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        logo={logo}
        headerSlot={headerSlot}
        footerSlot={footerSlot}
        activePathname={activePathname}
        filterItem={filterItem}
      />
      <main
        className="flex-1 overflow-auto transition-[margin-left] duration-200"
        style={
          isMobile
            ? { marginLeft: 0, paddingTop: "3.5rem" }
            : { marginLeft: collapsed ? "4rem" : "15rem" }
        }
      >
        {children}
      </main>
    </div>
  );
}
