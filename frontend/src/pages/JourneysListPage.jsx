import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import {
  Compass,
  Plus,
  Calendar,
  Clock,
  Hash,
  ArrowRight,
  Sparkles,
  AlertCircle,
  RefreshCw,
  FileCode,
} from 'lucide-react';

export const JourneysListPage = () => {
  const { token } = useAuth();
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchJourneys = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/journeys', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setJourneys(data.journeys || []);
      } else {
        setError(data.error || 'Failed to load journeys');
      }
    } catch (err) {
      console.error('Failed to fetch journeys:', err);
      setError('Network error loading journeys. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJourneys();
  }, [token]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Active
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Paused
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            Completed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <Compass className="w-3.5 h-3.5" />
              <span>Automated Cadences</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              Your Posting Journeys
            </h1>
            <p className="mt-1 text-slate-400 text-sm">
              Manage your content streak templates and automated LinkedIn posting series.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchJourneys}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Refresh list"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <Link
              to="/journeys/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>New Journey</span>
            </Link>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-500/30 flex items-start justify-between gap-3 text-red-200 text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={fetchJourneys}
              className="text-xs text-red-300 underline hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 animate-pulse space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="w-20 h-5 bg-slate-800 rounded-full" />
                  <div className="w-16 h-5 bg-slate-800 rounded-full" />
                </div>
                <div className="w-3/4 h-6 bg-slate-800 rounded-lg" />
                <div className="w-full h-12 bg-slate-800/60 rounded-lg" />
                <div className="flex gap-2 pt-2 border-t border-slate-800">
                  <div className="w-1/2 h-4 bg-slate-800 rounded" />
                  <div className="w-1/2 h-4 bg-slate-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && journeys.length === 0 && (
          <div className="text-center py-16 px-4 rounded-3xl bg-slate-900/40 border border-slate-800/80 max-w-2xl mx-auto backdrop-blur-sm">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-blue-500/20 border border-indigo-500/30 flex items-center justify-center mx-auto mb-4 text-indigo-400 shadow-inner">
              <Compass className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">No Journeys Created Yet</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto mb-6 leading-relaxed">
              Start your first posting journey to establish a consistent LinkedIn content cadence with structured templates and automated scheduling.
            </p>
            <Link
              to="/journeys/new"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Create Your First Journey</span>
            </Link>
          </div>
        )}

        {/* Journeys Grid */}
        {!loading && journeys.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {journeys.map((journey) => {
              const journeyId = journey._id || journey.id;
              return (
                <Link
                  key={journeyId}
                  to={`/journeys/${journeyId}`}
                  className="group relative flex flex-col justify-between bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-6 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-0.5"
                >
                  <div className="space-y-4">
                    {/* Top Row: Status Badge + Day Indicator */}
                    <div className="flex items-center justify-between gap-2">
                      {getStatusBadge(journey.status)}
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-indigo-300 border border-slate-700/80">
                        Day {journey.currentDay ?? 0}
                      </span>
                    </div>

                    {/* Title */}
                    <div>
                      <h2 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-2">
                        {journey.title}
                      </h2>
                    </div>

                    {/* Template snippet */}
                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs font-mono text-slate-400 line-clamp-3 leading-relaxed">
                      {journey.template}
                    </div>

                    {/* Hashtags preview */}
                    {Array.isArray(journey.hashtags) && journey.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {journey.hashtags.slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-0.5 text-[11px] font-mono text-indigo-300/80 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/15"
                          >
                            <Hash className="w-2.5 h-2.5" />
                            {tag.replace(/^#/, '')}
                          </span>
                        ))}
                        {journey.hashtags.length > 3 && (
                          <span className="text-[11px] text-slate-500 self-center">
                            +{journey.hashtags.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        {journey.postTimeLocal || '09:00'}
                      </span>
                      {journey.startDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          {new Date(journey.startDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    <span className="inline-flex items-center gap-1 font-semibold text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                      <span>View</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default JourneysListPage;
