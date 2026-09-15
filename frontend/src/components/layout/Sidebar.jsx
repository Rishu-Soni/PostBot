import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  Zap,
  Bell,
  Settings,
  PlusCircle,
  LogOut,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { notificationService } from '../../services/notificationService';

export const Sidebar = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unresolvedCount, setUnresolvedCount] = useState(0);

  // Poll or fetch unresolved notification count
  useEffect(() => {
    let isMounted = true;
    const fetchUnresolved = async () => {
      try {
        const res = await notificationService.getNotifications({ resolved: false, limit: 1 });
        if (isMounted && res?.total !== undefined) {
          setUnresolvedCount(res.total);
        }
      } catch {
        // Silent catch for background notification poll
      }
    };

    fetchUnresolved();
    const interval = setInterval(fetchUnresolved, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [location.pathname]);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Batches', path: '/batches', icon: Layers },
    { name: 'Credits', path: '/credits', icon: Zap },
    {
      name: 'Notifications',
      path: '/notifications',
      icon: Bell,
      badge: unresolvedCount > 0 ? unresolvedCount : null,
    },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-surface border-r border-border-warm flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-border-light">
          <NavLink
            to="/dashboard"
            onClick={handleNavClick}
            className="flex items-center gap-3 font-bold text-ink text-lg tracking-tight group"
          >
            <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-white shadow-sm shadow-brand/20 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="leading-none text-ink">PostBot</span>
              <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase text-brand bg-brand-soft rounded border border-brand/20 mt-1 w-fit">
                Founder Edition
              </span>
            </div>
          </NavLink>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-ink-muted hover:text-ink rounded-lg lg:hidden"
            aria-label="Close Sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Action Button */}
        <div className="px-4 pt-5 pb-3">
          <NavLink
            to="/batches/new"
            onClick={handleNavClick}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-coral hover:bg-coral-hover text-white font-semibold text-sm shadow-coral transition-all active:scale-[0.98]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Weekly Batch</span>
          </NavLink>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto custom-scroll">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-brand-soft text-brand border border-brand/15'
                      : 'text-ink-muted hover:text-ink hover:bg-canvas/60'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4.5 h-4.5 transition-colors ${
                          isActive ? 'text-brand' : 'text-ink-subtle'
                        }`}
                      />
                      <span>{item.name}</span>
                    </div>
                    {item.badge !== null && item.badge !== undefined && (
                      <span className="px-1.5 py-0.5 text-xs font-bold rounded-full bg-coral-soft text-coral border border-coral/20">
                        {item.badge}
                      </span>
                    )}
                    {isActive && !item.badge && (
                      <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User Card & Logout */}
        <div className="p-3 border-t border-border-light">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-canvas/50">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white font-bold text-xs shrink-0">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink truncate">
                  {user?.name || 'User'}
                </p>
                <p className="text-[11px] text-ink-subtle truncate">
                  {user?.email || ''}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="p-1.5 text-ink-subtle hover:text-coral rounded-lg hover:bg-coral-soft transition-colors shrink-0"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
