import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import {
  User,
  Mail,
  Globe,
  Calendar,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Compass,
  PlusCircle,
} from 'lucide-react';
import LinkedInIcon from '../components/LinkedInIcon';

export const DashboardPage = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Navigation Header */}
      <Navbar />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="space-y-8">
          {/* Welcome Header */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900/30 via-indigo-900/20 to-purple-900/30 border border-indigo-500/20 p-8">
            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-4">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Authenticated Session</span>
              </div>
              <h1 className="text-3xl font-extrabold text-white sm:text-4xl tracking-tight">
                Welcome back, {user?.name || 'Creator'}!
              </h1>
              <p className="mt-3 text-slate-300 text-base leading-relaxed">
                Build your consistent LinkedIn presence with automated journeys, scheduled drafts, and AI-powered topic generation.
              </p>
            </div>
            {/* Ambient background blob */}
            <div className="absolute right-0 top-0 -mt-10 -mr-10 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          </div>

          {/* Posting Journeys Quick Action Feature Card */}
          <div className="relative rounded-2xl bg-gradient-to-r from-indigo-950/50 via-slate-900 to-slate-900/90 border border-indigo-500/30 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl shadow-indigo-950/20">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 shrink-0">
                <Compass className="w-7 h-7" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1 border border-indigo-500/20">
                  <Sparkles className="w-3 h-3" /> Core Workflow
                </div>
                <h2 className="text-xl font-bold text-white">Posting Journeys</h2>
                <p className="text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">
                  Create daily posting cadences, manage post templates, configure topic placeholders, and schedule your automated LinkedIn streaks.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Link
                to="/journeys"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-sm font-semibold border border-slate-700 transition-colors"
              >
                <span>View Journeys</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/journeys/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>New Journey</span>
              </Link>
            </div>
          </div>

          {/* User Profile Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 flex items-start gap-4">
              <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Account Name</p>
                <p className="text-sm font-semibold text-slate-100 mt-1">{user?.name || 'N/A'}</p>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 flex items-start gap-4">
              <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Email Address</p>
                <p className="text-sm font-semibold text-slate-100 mt-1 truncate max-w-[180px]">
                  {user?.email || 'N/A'}
                </p>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 flex items-start gap-4">
              <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Timezone</p>
                <p className="text-sm font-semibold text-slate-100 mt-1">{user?.timezone || 'UTC'}</p>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 flex items-start gap-4">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Member Since</p>
                <p className="text-sm font-semibold text-slate-100 mt-1">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Today'}
                </p>
              </div>
            </div>
          </div>

          {/* LinkedIn Integration Banner */}
          <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-900/80 border border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-[#0A66C2]/15 border border-[#0A66C2]/30 flex items-center justify-center text-[#0A66C2] shrink-0">
                <LinkedInIcon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Platform Integration: LinkedIn</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Connect your LinkedIn account to enable automated publishing, draft synchronization, and scheduling.
                </p>
              </div>
            </div>

            <Link
              to="/settings"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors shrink-0"
            >
              <span>Manage in Settings</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;
