'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminLayout } from './layout/AdminLayout';
import type { SidebarNavItem } from './layout/types';
import ProjectSwitcher, { type ProjectRef } from './ProjectSwitcher';
import {
  NAV_GROUPS,
  APPS,
  ROLE_LABEL,
  ROLE_COLOR,
  canSeeItem,
  type NavItem,
  type MCNavGroup,
} from './Sidebar';

// ─── Me type (mirrors what /api/auth/me returns) ──────────────────────────────

interface Me {
  name: string;
  username: string;
  role: string;
  currentProject: ProjectRef | null;
  availableProjects: ProjectRef[];
}

// ─── Build nav groups for AdminLayout ─────────────────────────────────────────
// MC nav uses a custom NavItem type (icon: React.ElementType, minRole: Role).
// AdminLayout/SidebarNavItem accepts icon?: LucideIcon which is compatible since
// all MC icons are Lucide components (same signature at runtime).
// We cast to satisfy TypeScript without changing runtime behaviour.

function buildMCGroups(userRole: string): MCNavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => canSeeItem(i.minRole, userRole)),
  })).filter((g) => g.items.length > 0);
}

function buildAppsGroup(userRole: string): MCNavGroup | null {
  const visible = APPS.filter((a) => canSeeItem(a.minRole, userRole));
  if (visible.length === 0) return null;
  return { label: 'Apps', items: visible };
}

// ─── Footer slot component ────────────────────────────────────────────────────

function SidebarFooter({
  me,
  onLogout,
  collapsed = false,
}: {
  me: Me | null;
  onLogout: () => void;
  collapsed?: boolean;
}) {
  if (!me) return null;

  const initial = (me.name || me.username || '?').charAt(0).toUpperCase();

  // ── Compact variant (collapsed sidebar) ─────────────────────────────────────
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-3">
        {/* Mini avatar circle */}
        <div
          className="w-8 h-8 rounded-full border bg-[var(--brand-muted)] flex items-center justify-center text-xs font-bold flex-shrink-0 text-[var(--brand)]"
          style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}
          title={`${me.name} (${ROLE_LABEL[me.role] ?? me.role})`}
        >
          {initial}
        </div>
        {/* Compact LogOut icon */}
        <button
          onClick={onLogout}
          title="Sair"
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-muted)] transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ── Expanded variant ─────────────────────────────────────────────────────────
  return (
    <div className="flex-shrink-0 px-3 py-3">
      {/* User card */}
      <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors mb-1 overflow-hidden">
        <div
          className="w-7 h-7 rounded-full border bg-[var(--brand-muted)] flex items-center justify-center text-xs font-bold flex-shrink-0 text-[var(--brand)]"
          style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}
          title={`${me.name} (${ROLE_LABEL[me.role] ?? me.role})`}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-[var(--text-primary)] truncate">{me.name}</div>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              ROLE_COLOR[me.role] ?? 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'
            }`}
          >
            {ROLE_LABEL[me.role] ?? me.role}
          </span>
        </div>
      </div>

      {/* LogOut */}
      <button
        onClick={onLogout}
        title="Sair"
        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-muted)] transition-colors overflow-hidden"
      >
        <LogOut className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">Sair</span>
      </button>
    </div>
  );
}

// ─── MC Logo slot ─────────────────────────────────────────────────────────────
// Always renders the expanded form; layout/Sidebar.tsx hides the label span
// when collapsed via `cn(collapsed && !isMobile && "hidden")`.

function MCLogo() {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div
        className="w-8 h-8 rounded-lg bg-[var(--brand-muted)] border flex items-center justify-center flex-shrink-0"
        style={{ borderColor: 'rgba(245, 158, 11, 0.2)' }}
      >
        <span className="font-black text-sm font-mono text-[var(--brand)]">MC</span>
      </div>
      <div className="min-w-0">
        <div className="font-bold text-[var(--text-primary)] text-sm leading-tight truncate">
          Mission Control
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">OpenClaw</div>
      </div>
    </div>
  );
}

// ─── SidebarLayout (main export) ─────────────────────────────────────────────
// Wraps AdminLayout with MC-specific slots. AdminLayout manages
// collapse/mobile/localStorage — storageKey='mc-sidebar' preserves the existing key.

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d as Me | null))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const userRole = me?.role ?? '';

  // Build groups: NAV_GROUPS + optional Apps group
  const mcGroups = buildMCGroups(userRole);
  const appsGroup = buildAppsGroup(userRole);
  const allGroups = appsGroup ? [...mcGroups, appsGroup] : mcGroups;

  // Cast MC groups to the AdminLayout-compatible SidebarNavItem shape.
  // NavItem uses `icon: React.ElementType` which is a superset of LucideIcon —
  // all MC icons are Lucide components so this cast is safe at runtime.
  const navGroups = allGroups.map((g) => ({
    label: g.label,
    items: g.items as unknown as SidebarNavItem[],
  }));

  const headerSlot = me
    ? ({ collapsed }: { collapsed: boolean }) => (
        <ProjectSwitcher
          currentProject={me.currentProject}
          availableProjects={me.availableProjects}
          collapsed={collapsed}
        />
      )
    : null;

  const footerSlot = ({ collapsed }: { collapsed: boolean }) => (
    <SidebarFooter me={me} onLogout={handleLogout} collapsed={collapsed} />
  );

  // filterItem at AdminLayout level (belt-and-suspenders on top of buildMCGroups)
  const filterItem = (item: SidebarNavItem) => {
    const minRole = (item as unknown as NavItem).minRole;
    return minRole ? canSeeItem(minRole, userRole) : true;
  };

  return (
    <AdminLayout
      groups={navGroups}
      items={[]}
      storageKey="mc-sidebar"
      logo={<MCLogo />}
      headerSlot={headerSlot}
      footerSlot={footerSlot}
      activePathname={pathname}
      filterItem={filterItem}
    >
      {children}
    </AdminLayout>
  );
}
