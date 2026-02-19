import type { ReactNode } from 'react';
import { SidebarChat } from './SidebarChat.js';

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * Main layout for the dashboard after setup is complete.
 * Full-width flex container: main content area + fixed 320px sidebar chat.
 * On mobile (< 768px), sidebar stacks below main content.
 */
export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="dashboard-layout">
      <main className="dashboard-main">
        {children}
      </main>
      <aside className="dashboard-sidebar">
        <SidebarChat />
      </aside>
    </div>
  );
}
