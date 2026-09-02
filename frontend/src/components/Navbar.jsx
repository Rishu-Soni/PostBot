import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Sparkles,
  LayoutDashboard,
  Compass,
  Settings as SettingsIcon,
  LogOut,
  PlusCircle,
} from 'lucide-react';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/journeys') {
      return location.pathname.startsWith('/journeys');
    }
    return location.pathname === path;
  };

  return (
    <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand and primary navigation */}
        <div className="flex items-center gap-6 lg:gap-8">
          <Link to="/dashboard" className="flex items-center gap-3 group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
              PostBot
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1.5">
            <Link
              to="/dashboard"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/dashboard'
                  ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </Link>

            <Link
              to="/journeys"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive('/journeys')
                  ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Journeys</span>
            </Link>

            <Link
              to="/settings"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/settings'
                  ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span>Settings</span>
            </Link>
          </nav>
        </div>

        {/* Right side actions & user info */}
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            to="/journeys/new"
            className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold shadow-sm shadow-indigo-500/25 transition-all active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Journey</span>
          </Link>

          <div className="hidden sm:flex items-center gap-2 text-sm text-slate-300">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-indigo-400">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <span className="font-medium text-slate-200">{user?.name}</span>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 hover:border-slate-600 text-slate-300 hover:text-white text-xs sm:text-sm font-medium transition-all duration-150"
            title="Log out"
          >
            <LogOut className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </div>

      {/* Mobile sub-navigation bar */}
      <div className="md:hidden flex items-center justify-around px-4 py-2 border-t border-slate-800/60 bg-slate-900/40 text-xs">
        <Link
          to="/dashboard"
          className={`flex items-center gap-1.5 py-1 px-2.5 rounded-md ${
            location.pathname === '/dashboard' ? 'text-indigo-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>
        <Link
          to="/journeys"
          className={`flex items-center gap-1.5 py-1 px-2.5 rounded-md ${
            isActive('/journeys') ? 'text-indigo-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Journeys</span>
        </Link>
        <Link
          to="/journeys/new"
          className={`flex items-center gap-1.5 py-1 px-2.5 rounded-md ${
            location.pathname === '/journeys/new' ? 'text-indigo-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Create</span>
        </Link>
        <Link
          to="/settings"
          className={`flex items-center gap-1.5 py-1 px-2.5 rounded-md ${
            location.pathname === '/settings' ? 'text-indigo-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          <span>Settings</span>
        </Link>
      </div>
    </header>
  );
};

export default Navbar;
