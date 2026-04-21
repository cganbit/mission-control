"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SidebarNavItem } from "./types";

interface SidebarProps {
  items: SidebarNavItem[];
  collapsed: boolean;
  onToggle: () => void;
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
  logo?: React.ReactNode;
}

export function Sidebar({
  items,
  collapsed,
  onToggle,
  isMobile,
  isOpen,
  onClose,
  logo,
}: SidebarProps) {
  const pathname = usePathname();

  const content = (
    <nav className="flex h-full flex-col bg-card border-r border-border">
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

      <ul className="flex-1 overflow-auto py-2 px-2 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname?.startsWith(item.href + "/");
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
        })}
      </ul>
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
