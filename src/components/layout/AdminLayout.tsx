"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { MobileHeader } from "./MobileHeader";
import type { SidebarNavItem } from "./types";

export interface AdminLayoutProps {
  items: SidebarNavItem[];
  children: React.ReactNode;
  logo?: React.ReactNode;
  storageKey?: string;
}

export function AdminLayout({
  items,
  children,
  logo,
  storageKey = "wingx-sidebar",
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
        <MobileHeader onMenuClick={() => setSidebarOpen(true)} logo={logo} />
      ) : null}
      <Sidebar
        items={items}
        collapsed={collapsed}
        onToggle={toggle}
        isMobile={isMobile}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        logo={logo}
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
