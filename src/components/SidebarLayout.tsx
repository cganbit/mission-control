'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('mc-sidebar');
    if (saved === '1') setCollapsed(true);
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const toggle = () => {
    setCollapsed(c => {
      localStorage.setItem('mc-sidebar', c ? '0' : '1');
      return !c;
    });
  };

  return (
    <div className="flex h-screen bg-[var(--bg-base)]">
      {isMobile && <MobileHeader onMenuClick={() => setSidebarOpen(true)} />}
      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        isMobile={isMobile}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main
        className="flex-1 overflow-auto transition-[margin-left] duration-200"
        style={isMobile
          ? { marginLeft: 0, paddingTop: '3.5rem' }
          : { marginLeft: collapsed ? '4rem' : '15rem' }
        }
      >
        {children}
      </main>
    </div>
  );
}
