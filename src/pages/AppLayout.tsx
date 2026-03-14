import { Navigate, useLocation } from 'react-router-dom';
import { useGateStore } from '../stores/gateStore';
import { Sidebar } from '../components/ui/Sidebar';
import { TopProgressBar } from '../components/ui/TopProgressBar';
import { PageTransition } from '../components/ui/PageTransition';
import { useState, useEffect } from 'react';

export function AppLayout() {
  const checkValid = useGateStore((s) => s.checkValid);
  const location = useLocation();
  const isSharePage = location.pathname.startsWith('/s/');

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; }
    catch { return false; }
  });

  useEffect(() => {
    const handleToggle = (e: Event) => {
      setCollapsed((e as CustomEvent<boolean>).detail);
    };
    window.addEventListener('sidebar-toggle', handleToggle);
    return () => window.removeEventListener('sidebar-toggle', handleToggle);
  }, []);

  if (isSharePage) {
    return <PageTransition />;
  }

  if (!checkValid()) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  const ml = collapsed ? 'ml-[60px]' : 'ml-[240px]';

  return (
    <div className="min-h-screen flex bg-base">
      <Sidebar />
      <div className={`flex-1 ${ml} transition-all duration-200`}>
        <TopProgressBar />
        <main className="p-8 lg:p-12 max-w-6xl w-full mx-auto">
          <PageTransition />
        </main>
      </div>
    </div>
  );
}
