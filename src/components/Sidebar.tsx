'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard',  label: 'Dashboard',   icon: '🏠' },
  { href: '/squads',     label: 'Squads',       icon: '🛡️' },
  { href: '/tasks',      label: 'Task Board',   icon: '📋' },
  { href: '/agents',     label: 'Agentes',      icon: '🤖' },
  { href: '/activity',   label: 'Activity Feed', icon: '⚡' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

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
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(item => (
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
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-gray-800">
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
