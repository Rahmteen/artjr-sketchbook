import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Home,
  Music,
  FolderOpen,
  Clock,
  Plus,
  Lock,
  PanelLeftClose,
  PanelLeft,
  Folder,
} from 'lucide-react';
import { collectionsApi } from '../../api/client';
import type { ApiCollection } from '../../api/client';
import { useGateStore } from '../../stores/gateStore';
import { EASE_OUT_EXPO } from './Motion';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/home', label: 'Home', icon: Home, exact: true },
  { to: '/sketches', label: 'Sketches', icon: Music },
  { to: '/collections', label: 'Collections', icon: FolderOpen, exact: true },
  { to: '/timeline', label: 'Timeline', icon: Clock },
];

function isActive(pathname: string, to: string, exact?: boolean): boolean {
  if (exact) return pathname === to;
  return pathname.startsWith(to);
}

export function Sidebar() {
  const location = useLocation();
  const lockFn = useGateStore((s) => s.lock);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  const [collections, setCollections] = useState<ApiCollection[]>([]);

  const loadCollections = () => {
    collectionsApi.list().then(setCollections).catch(() => {});
  };

  useEffect(() => { loadCollections(); }, []);

  useEffect(() => {
    const handler = () => loadCollections();
    window.addEventListener('collections-updated', handler);
    return () => window.removeEventListener('collections-updated', handler);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('sidebar-collapsed', String(collapsed)); }
    catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: collapsed }));
  }, [collapsed]);

  const width = collapsed ? 'w-[60px]' : 'w-[240px]';

  return (
    <motion.aside
      className={`fixed left-0 top-0 h-screen ${width} bg-surface border-r border-border flex flex-col transition-all duration-200 z-50`}
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
    >
      {/* Brand */}
      <motion.div
        className="flex items-center h-14 px-4 shrink-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <Link to="/home" className="no-underline text-inherit flex items-center gap-2.5 min-w-0">
          {collapsed ? (
            <span className="text-sm font-bold text-accent shrink-0 tracking-tight ml-2">ajr</span>
          ) : (
            <span className="text-sm font-bold text-text tracking-tight truncate">
              <span className="ml-2 text-accent">a</span>rtjr
            </span>
          )}
        </Link>
      </motion.div>

      {/* Upload button */}
      <motion.div
        className="px-3 mb-2"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.35, ease: EASE_OUT_EXPO }}
      >
        <Link
          to="/sketches/upload"
          className={`btn btn-primary w-full no-underline ${collapsed ? 'px-0 justify-center' : ''}`}
        >
          <Plus size={16} />
          {!collapsed && <span>Upload</span>}
        </Link>
      </motion.div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {NAV_ITEMS.map((item, idx) => {
          const Icon = item.icon;
          const active = isActive(location.pathname, item.to, item.exact);
          return (
            <motion.div
              key={item.to}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + idx * 0.04, duration: 0.3, ease: EASE_OUT_EXPO }}
            >
              <Link
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium no-underline transition-all duration-150 ${
                  active
                    ? 'bg-hover text-text'
                    : 'text-secondary hover:text-text hover:bg-hover/50'
                } ${collapsed ? 'justify-center px-0' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={18} className={active ? 'text-accent' : ''} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            </motion.div>
          );
        })}

        {/* Collections section */}
        {!collapsed && collections.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-tertiary">
              Collections
            </span>
            <div className="mt-2 space-y-0.5">
              {collections.slice(0, 10).map((c) => {
                const active = location.pathname === `/collections/${c.id}`;
                return (
                  <Link
                    key={c.id}
                    to={`/collections/${c.id}`}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] no-underline transition-colors ${
                      active
                        ? 'bg-hover text-text'
                        : 'text-secondary hover:text-text hover:bg-hover/50'
                    }`}
                  >
                    <Folder size={14} className={active ? 'text-accent' : 'text-tertiary'} />
                    <span className="truncate flex-1">{c.name}</span>
                    {c.sketchCount != null && c.sketchCount > 0 && (
                      <span className="text-[11px] text-tertiary tabular-nums shrink-0">{c.sketchCount}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {collapsed && collections.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border flex flex-col items-center gap-1">
            {collections.slice(0, 5).map((c) => (
              <Link
                key={c.id}
                to={`/collections/${c.id}`}
                title={c.name}
                className={`flex items-center justify-center w-9 h-9 rounded-md no-underline transition-colors ${
                  location.pathname === `/collections/${c.id}`
                    ? 'bg-hover text-accent'
                    : 'text-tertiary hover:text-text hover:bg-hover/50'
                }`}
              >
                <Folder size={14} />
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Bottom controls */}
      <div className="px-2 py-3 border-t border-border space-y-1 shrink-0">
        <button
          type="button"
          onClick={lockFn}
          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-secondary hover:text-text hover:bg-hover/50 transition-colors w-full ${
            collapsed ? 'justify-center px-0' : ''
          }`}
          title={collapsed ? 'Lock' : undefined}
        >
          <Lock size={18} />
          {!collapsed && <span>Lock</span>}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-secondary hover:text-text hover:bg-hover/50 transition-colors w-full ${
            collapsed ? 'justify-center px-0' : ''
          }`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
