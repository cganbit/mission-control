"use client";

import { AdminLayout } from "@/components/layout/AdminLayout";
import type { SidebarNavItem } from "@/components/layout/types";
import { LayoutDashboard, Palette, Puzzle } from "lucide-react";

const NAV_ITEMS: SidebarNavItem[] = [
  {
    label: "Overview",
    href: "/admin-demo",
    icon: LayoutDashboard,
  },
  {
    label: "Tokens",
    href: "/admin-demo/tokens",
    icon: Palette,
  },
  {
    label: "Playground",
    href: "/admin-demo/playground",
    icon: Puzzle,
  },
];

export default function AdminDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminLayout items={NAV_ITEMS} storageKey="wingx-admin-demo-sidebar">
      {children}
    </AdminLayout>
  );
}
