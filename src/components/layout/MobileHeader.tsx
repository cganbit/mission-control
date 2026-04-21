"use client";

import { Menu } from "lucide-react";

interface MobileHeaderProps {
  onMenuClick: () => void;
  logo?: React.ReactNode;
}

export function MobileHeader({ onMenuClick, logo }: MobileHeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-20 h-14 bg-card border-b border-border flex items-center justify-between px-4">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="p-1 rounded hover:bg-muted"
      >
        <Menu className="size-5" />
      </button>
      <div className="flex items-center gap-2">
        {logo ?? (
          <span className="font-mono text-sm font-semibold text-primary">
            wingx
          </span>
        )}
      </div>
      <div className="w-7" aria-hidden="true" />
    </header>
  );
}
