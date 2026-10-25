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
import { Logo } from '../common/Logo';

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
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-white border-r border-[#E2E8F0] flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-14 px-5 border-b border-[#E2E8F0]">
          <NavLink
            to="/dashboard"
            onClick={handleNavClick}
            className="flex items-center gap-2 font-bold text-ink text-base tracking-tight"
          >
            <Logo size="sm" />
            <span className="leading-none text-ink">PostBot</span>
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded bg-[#E2E8F0] text-[#64748B]">
              PRO
            </span>
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
        <div className="px-4 pt-5 pb-4 mb-5 border-b border-[#F1F5F9]">
          <NavLink
            to="/batches/new"
            onClick={handleNavClick}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-[10px] bg-[#1E88E5] hover:bg-[#1565C0] text-white font-semibold text-sm shadow-sm transition-all active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-[#1E88E5]/25"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ New Weekly Batch</span>
          </NavLink>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-1 space-y-1 overflow-y-auto custom-scroll">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${
                    isActive
                      ? 'bg-[#EFF6FF] text-[#1E88E5] font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive ? 'text-[#1E88E5]' : 'text-slate-400'
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
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1E88E5]" />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User Card & Logout */}
        <div className="p-3 border-t border-[#E2E8F0]">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-[#E2E8F0]/60">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#1E88E5] flex items-center justify-center text-white font-bold text-xs shrink-0">
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
