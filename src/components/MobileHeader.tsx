'use client';

import { Menu } from 'lucide-react';

interface MobileHeaderProps {
  onMenuClick: () => void;
}

export default function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-30 h-14 flex items-center px-4 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
      <button
        onClick={onMenuClick}
        className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-2 ml-3">
        <div
          className="w-7 h-7 rounded-lg bg-[var(--brand-muted)] border flex items-center justify-center flex-shrink-0"
          style={{ borderColor: 'rgba(245, 158, 11, 0.2)' }}
        >
          <span className="font-black text-xs font-mono text-[var(--brand)]">MC</span>
        </div>
        <span className="font-bold text-sm text-[var(--text-primary)]">Mission Control</span>
      </div>
    </header>
  );
}
