'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  minRole: 'viewer' | 'member' | 'admin';
}

interface AppItem {
  href: string;
  label: string;
  icon: string;
  minRole: 'viewer' | 'member' | 'admin';
}

const NAV: NavItem[] = [
  { href: '/dashboard',  label: 'Dashboard',      icon: '🏠', minRole: 'viewer' },
  { href: '/squads',     label: 'Squads',          icon: '🛡️', minRole: 'viewer' },
  { href: '/tasks',      label: 'Task Board',      icon: '📋', minRole: 'viewer' },
  { href: '/agents',     label: 'Agentes',         icon: '🤖', minRole: 'viewer' },
  { href: '/activity',   label: 'Activity Feed',   icon: '⚡', minRole: 'viewer' },
  { href: '/calendar',   label: 'Calendar',        icon: '📅', minRole: 'viewer' },
  { href: '/memory',     label: 'Memory',          icon: '🧠', minRole: 'viewer' },
  { href: '/documents',  label: 'Documentos',      icon: '📂', minRole: 'viewer' },
  { href: '/tokens',     label: 'Tokens & Custo',  icon: '🪙', minRole: 'member'  },
  { href: '/connectors',   label: 'Conectores',      icon: '🔌', minRole: 'admin'   },
  { href: '/users',        label: 'Usuarios',        icon: '👤', minRole: 'admin'   },
  { href: '/infograficos', label: 'Infográficos',    icon: '📊', minRole: 'admin'   },
];

const APPS: AppItem[] = [
  { href: '/paraguai', label: 'Oportunidades PY', icon: '🇵🇾', minRole: 'member' },
  { href: '/paraguai-assets', label: 'Assets PY', icon: '📦', minRole: 'member' },
  { href: '/mercado-livre', label: 'Mercado Livre', icon: '🛍️', minRole: 'member' },
  { href: '/mercado-livre/contas', label: 'Contas ML', icon: '🔑', minRole: 'member' },
];

const ROLE_LEVEL: Record<string, number> = { admin: 3, member: 2, viewer: 1 };
const ROLE_LABEL: Record<string, string>  = { admin: 'Admin', member: 'Membro', viewer: 'Viewer' };
const ROLE_COLOR: Record<string, string>  = {
  admin:  'bg-indigo-900 text-indigo-300',
  member: 'bg-blue-900 text-blue-300',
  viewer: 'bg-gray-800 text-gray-400',
};

interface Me { name: string; username: string; role: string }

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [appsOpen, setAppsOpen] = useState(() => {
    // Auto-open if current path is an app
    if (typeof window !== 'undefined') {
      return APPS.some(a => window.location.pathname.startsWith(a.href));
    }
    return false;
  });

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => setMe(d as Me | null))
      .catch(() => {});
  }, []);

  // Auto-open Apps section if on an app page
  useEffect(() => {
    if (APPS.some(a => pathname.startsWith(a.href))) {
      setAppsOpen(true);
    }
  }, [pathname]);

  const roleLevel   = ROLE_LEVEL[me?.role ?? ''] ?? 0;
  const visibleNav  = NAV.filter(item => roleLevel >= ROLE_LEVEL[item.minRole]);
  const visibleApps = APPS.filter(app => roleLevel >= ROLE_LEVEL[app.minRole]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const isAppActive = APPS.some(a => pathname.startsWith(a.href));

  return (
    <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col h-screen fixed left-0 top-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎯</span>
          <div>
            <div className="font-bold text-white text-sm leading-tight">Mission Control</div>
            <div className="text-xs text-gray-500">OpenClaw</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {/* Apps submenu */}
        {visibleApps.length > 0 && (
          <div className="pt-1">
            <button
              onClick={() => setAppsOpen(o => !o)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isAppActive
                  ? 'text-indigo-300 bg-indigo-950'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )}
            >
              <span className="text-base">📦</span>
              <span className="flex-1 text-left">Apps</span>
              <span className="text-xs text-gray-600">{appsOpen ? '▲' : '▼'}</span>
            </button>

            {appsOpen && (
              <div className="mt-1 ml-3 pl-3 border-l border-gray-800 space-y-1">
                {visibleApps.map(app => (
                  <Link
                    key={app.href}
                    href={app.href}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      pathname.startsWith(app.href)
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    )}
                  >
                    <span className="text-sm">{app.icon}</span>
                    {app.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Current user card */}
      {me && (
        <div className="px-4 py-3 border-t border-gray-800">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-800 transition-colors">
            <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {(me.name || me.username || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">{me.name}</div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ROLE_COLOR[me.role] ?? 'bg-gray-800 text-gray-400'}`}>
                {ROLE_LABEL[me.role] ?? me.role}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Logout */}
      <div className="px-3 pb-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <span>🚪</span> Sair
        </button>
      </div>
    </aside>
  );
}
