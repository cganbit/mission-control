'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Shield, ClipboardList, Bot, Zap, Calendar, Brain,
  FolderOpen, CircleDollarSign, Plug, Users, BarChart2,
  TrendingUp, Package, ShoppingBag, KeyRound, Activity, UsersRound,
  PanelLeftClose, PanelLeftOpen, LogOut, ChevronDown, ChevronUp, AppWindow, Sparkles, Printer,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'viewer' | 'member' | 'admin';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  minRole: Role;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// ─── Navigation structure ─────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard',  label: 'Dashboard',    icon: LayoutDashboard,  minRole: 'viewer' },
      { href: '/squads',     label: 'Squads',        icon: Shield,           minRole: 'viewer' },
      { href: '/tasks',      label: 'Task Board',    icon: ClipboardList,    minRole: 'viewer' },
      { href: '/agents',     label: 'Agentes',       icon: Bot,              minRole: 'viewer' },
    ],
  },
  {
    label: 'Operações',
    items: [
      { href: '/activity',   label: 'Activity Feed', icon: Zap,              minRole: 'viewer' },
      { href: '/calendar',   label: 'Calendar',      icon: Calendar,         minRole: 'viewer' },
      { href: '/memory',     label: 'Memory',        icon: Brain,            minRole: 'viewer' },
      { href: '/documents',  label: 'Documentos',    icon: FolderOpen,       minRole: 'viewer' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: '/tokens',     label: 'Tokens & Custo', icon: CircleDollarSign, minRole: 'member' },
      { href: '/analytics',  label: 'Sprint Analytics', icon: Sparkles,        minRole: 'member' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/team',         label: 'Team',          icon: UsersRound,       minRole: 'admin' },
      { href: '/connectors', label: 'Conectores',    icon: Plug,             minRole: 'admin' },
      { href: '/users',      label: 'Usuários',      icon: Users,            minRole: 'admin' },
      { href: '/infograficos', label: 'Infográficos', icon: BarChart2,       minRole: 'admin' },
      { href: '/sre',          label: 'SRE',          icon: Activity,         minRole: 'admin' },
    ],
  },
];

const APPS: NavItem[] = [
  { href: '/paraguai',             label: 'Oportunidades PY', icon: TrendingUp,  minRole: 'member' },
  { href: '/paraguai-assets',      label: 'Assets PY',        icon: Package,     minRole: 'member' },
  { href: '/mercado-livre',        label: 'Mercado Livre',    icon: ShoppingBag, minRole: 'member' },
  { href: '/mercado-livre/contas', label: 'Contas ML',        icon: KeyRound,    minRole: 'member' },
  { href: '/mercado-livre/pedidos',   label: 'Pedidos ML',   icon: ClipboardList, minRole: 'member' },
  { href: '/mercado-livre/clientes',  label: 'Clientes ML',  icon: Users,         minRole: 'member' },
  { href: '/fila',                    label: 'Fila de Impressão', icon: Printer,  minRole: 'member' },
];

const ROLE_LEVEL: Record<string, number> = { admin: 3, member: 2, viewer: 1 };
const ROLE_LABEL: Record<string, string>  = { admin: 'Admin', member: 'Membro', viewer: 'Viewer' };
const ROLE_COLOR: Record<string, string>  = {
  admin:  'bg-[var(--brand-muted)] text-[var(--brand)] border border-[var(--brand)]/30',
  member: 'bg-[var(--info-muted)] text-[var(--info)] border border-[var(--info)]/30',
  viewer: 'bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-default)]',
};

interface Me { name: string; username: string; role: string }

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// ─── Nav link component ───────────────────────────────────────────────────────

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors relative',
        collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
        active
          ? 'bg-[var(--brand-muted)] text-[var(--brand)] border-l-2 border-[var(--brand)] pl-[calc(0.75rem-2px)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 border-l-2 border-transparent'
      )}
    >
      <Icon className={cn('flex-shrink-0', collapsed ? 'h-5 w-5' : 'h-4 w-4')} />
      {!collapsed && item.label}
    </Link>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [appsOpen, setAppsOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => setMe(d as Me | null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (APPS.some(a => pathname.startsWith(a.href))) setAppsOpen(true);
  }, [pathname]);

  const roleLevel   = ROLE_LEVEL[me?.role ?? ''] ?? 0;
  const isAppActive = APPS.some(a => pathname.startsWith(a.href));

  const visibleGroups = NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(i => roleLevel >= ROLE_LEVEL[i.minRole]),
  })).filter(g => g.items.length > 0);

  const visibleApps = APPS.filter(a => roleLevel >= ROLE_LEVEL[a.minRole]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <aside className={cn(
      'fixed left-0 top-0 h-screen flex flex-col border-r border-[var(--border-default)] bg-[var(--bg-surface)] transition-[width] duration-200 z-40',
      collapsed ? 'w-16' : 'w-60'
    )}>

      {/* Logo */}
      <div className={cn(
        'flex items-center border-b border-[var(--border-default)] flex-shrink-0',
        collapsed ? 'justify-center py-5 px-2' : 'justify-between px-4 py-5'
      )}>
        {!collapsed && (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--brand-muted)] border flex items-center justify-center flex-shrink-0" style={{ borderColor: 'rgba(245, 158, 11, 0.2)' }}>
              <span className="font-black text-sm font-mono text-[var(--brand)]">MC</span>
            </div>
            <div className="min-w-0">
              <div className="font-bold text-[var(--text-primary)] text-sm leading-tight truncate">Mission Control</div>
              <div className="text-[10px] text-[var(--text-muted)]">OpenClaw</div>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-[var(--brand-muted)] border flex items-center justify-center" style={{ borderColor: 'rgba(245, 158, 11, 0.2)' }}>
            <span className="font-black text-sm font-mono text-[var(--brand)]">MC</span>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={onToggle}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded flex-shrink-0"
            title="Recolher sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 overflow-y-auto py-3 space-y-4', collapsed ? 'px-2' : 'px-3')}>

        {visibleGroups.map(group => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold px-3 mb-1.5">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Apps */}
        {visibleApps.length > 0 && (
          <div>
            {!collapsed && (
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold px-3 mb-1.5">
                Apps
              </p>
            )}
            {!collapsed ? (
              <div className="space-y-0.5">
                <button
                  onClick={() => setAppsOpen(o => !o)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors border-l-2',
                    isAppActive
                      ? 'text-[var(--brand)] border-[var(--brand)] bg-[var(--brand-muted)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 border-transparent'
                  )}
                >
                  <AppWindow className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 text-left">Explorar</span>
                  {appsOpen
                    ? <ChevronUp className="h-3 w-3 text-[var(--text-muted)]" />
                    : <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />}
                </button>
                {appsOpen && (
                  <div className="ml-3 pl-3 border-l border-[var(--border-default)] space-y-0.5 mt-0.5">
                    {visibleApps.map(app => (
                      <NavLink
                        key={app.href}
                        item={app}
                        active={pathname.startsWith(app.href)}
                        collapsed={false}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                {visibleApps.map(app => (
                  <NavLink
                    key={app.href}
                    item={app}
                    active={pathname.startsWith(app.href)}
                    collapsed={true}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Expand button (collapsed mode) */}
      {collapsed && (
        <div className="px-2 pb-2">
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center py-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 rounded-lg transition-colors"
            title="Expandir sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* User card */}
      {me && (
        <div className={cn('border-t border-[var(--border-default)] flex-shrink-0', collapsed ? 'px-2 py-3' : 'px-3 py-3')}>
          {collapsed ? (
            <div
              className="w-8 h-8 mx-auto rounded-full border bg-[var(--brand-muted)] flex items-center justify-center cursor-default text-xs font-bold text-[var(--brand)]"
              style={{ borderColor: 'rgba(217, 119, 6, 0.3)' }}
              title={`${me.name} (${ROLE_LABEL[me.role] ?? me.role})`}
            >
              {(me.name || me.username || '?').charAt(0).toUpperCase()}
            </div>
          ) : (
            <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors">
              <div className="w-7 h-7 rounded-full border bg-[var(--brand-muted)] flex items-center justify-center text-xs font-bold flex-shrink-0 text-[var(--brand)]" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                {(me.name || me.username || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-[var(--text-primary)] truncate">{me.name}</div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ROLE_COLOR[me.role] ?? 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'}`}>
                  {ROLE_LABEL[me.role] ?? me.role}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Logout */}
      <div className={cn('pb-3 flex-shrink-0', collapsed ? 'px-2' : 'px-3')}>
        <button
          onClick={handleLogout}
          title="Sair"
          className={cn(
            'flex items-center gap-3 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-muted)] transition-colors',
            collapsed ? 'w-full justify-center py-2.5' : 'w-full px-3 py-2'
          )}
        >
          <LogOut className={cn('flex-shrink-0', collapsed ? 'h-5 w-5' : 'h-4 w-4')} />
          {!collapsed && 'Sair'}
        </button>
      </div>
    </aside>
  );
}
