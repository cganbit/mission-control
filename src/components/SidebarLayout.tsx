'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('mc-sidebar');
    if (saved === '1') setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed(c => {
      localStorage.setItem('mc-sidebar', c ? '0' : '1');
      return !c;
    });
  };

  return (
    <div className="flex h-screen bg-[#07090f]">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main
        className="flex-1 overflow-auto transition-[margin-left] duration-200"
        style={{ marginLeft: collapsed ? '4rem' : '15rem' }}
      >
        {children}
      </main>
    </div>
  );
}
