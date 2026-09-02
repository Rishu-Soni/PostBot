import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import {
  Sparkles,
  LayoutDashboard,
  Settings as SettingsIcon,
  LogOut,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Shield,
  Clock,
  UserCheck,
  Check,
  X,
} from 'lucide-react';
import LinkedInIcon from '../components/LinkedInIcon';

export const SettingsPage = () => {
  const { user, token, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [statusLoading, setStatusLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState({
    connected: false,
    memberId: null,
    expiresAt: null,
    scope: null,
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [successBanner, setSuccessBanner] = useState(false);

  // Parse query parameters on load
  useEffect(() => {
    const isConnectedParam = searchParams.get('connected');
    const errorParam = searchParams.get('error');

    if (isConnectedParam === 'true') {
      setSuccessBanner(true);
      setErrorMessage('');
    } else if (errorParam) {
      setErrorMessage(decodeURIComponent(errorParam));
      setSuccessBanner(false);
    }
  }, [searchParams]);

  // Fetch current LinkedIn connection status
  const fetchStatus = async () => {
    if (!token) return;
    setStatusLoading(true);
    try {
      const response = await fetch('/api/linkedin/status', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      } else {
        console.error('Failed to fetch LinkedIn status:', response.statusText);
      }
    } catch (err) {
      console.error('Network error fetching status:', err);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [token]);

  // Initiate LinkedIn OAuth Connect Flow
  const handleConnectLinkedIn = async () => {
    if (!token) return;
    setConnecting(true);
    setErrorMessage('');

    try {
      // Request authorization URL from backend
      const response = await fetch('/api/linkedin/connect', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          // Redirect browser to LinkedIn consent screen
          window.location.href = data.url;
          return;
        }
      }

      // If JSON response was not returned, fallback to direct query token navigation
      window.location.href = `/api/linkedin/connect?token=${encodeURIComponent(token)}`;
    } catch (err) {
      console.error('Failed to initiate LinkedIn OAuth:', err);
      setErrorMessage('Could not initiate LinkedIn connection. Please try again.');
      setConnecting(false);
    }
  };

  const dismissBanner = () => {
    setSuccessBanner(false);
    setErrorMessage('');
    // Remove query params from URL
    navigate('/settings', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Navigation Header */}
      <Navbar />

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="space-y-8">
          {/* Header Title */}
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Settings & Integrations</h1>
            <p className="mt-2 text-slate-400 text-sm">
              Connect external social accounts and manage your posting permissions securely.
            </p>
          </div>

          {/* Success Banner */}
          {successBanner && (
            <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-200">LinkedIn Connected Successfully!</p>
                  <p className="text-xs text-emerald-400/90 mt-0.5">
                    Your LinkedIn profile is now linked to PostBot. You can publish and schedule posts directly.
                  </p>
                </div>
              </div>
              <button
                onClick={dismissBanner}
                className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-200 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-rose-200">Connection Failed</p>
                  <p className="text-xs text-rose-400/90 mt-0.5">{errorMessage}</p>
                </div>
              </div>
              <button
                onClick={dismissBanner}
                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Connected Accounts Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              <span>Social Accounts</span>
            </h2>

            {/* LinkedIn Card */}
            <div className="relative overflow-hidden rounded-2xl bg-slate-900/70 border border-slate-800/90 p-6 shadow-xl backdrop-blur-sm transition-all hover:border-slate-700/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  {/* LinkedIn Icon */}
                  <div className="h-12 w-12 rounded-xl bg-[#0A66C2]/15 border border-[#0A66C2]/30 flex items-center justify-center text-[#0A66C2] shrink-0 shadow-lg shadow-[#0A66C2]/10">
                    <LinkedInIcon className="w-6 h-6" />
                  </div>

                  {/* Account Info */}
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-bold text-white">LinkedIn</h3>
                      {statusLoading ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs font-medium border border-slate-700">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Checking...
                        </span>
                      ) : status.connected ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold border border-emerald-500/30">
                          <Check className="w-3 h-3 stroke-[3]" />
                          Connected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs font-medium border border-slate-700">
                          Not Connected
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-slate-300">
                      Sign in with LinkedIn using OpenID Connect and authorize PostBot to share updates and posts.
                    </p>

                    {/* Additional connection metadata when connected */}
                    {status.connected && (
                      <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap gap-4 text-xs text-slate-400">
                        {status.memberId && (
                          <div className="flex items-center gap-1.5 bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700/50">
                            <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                            <span>Member ID:</span>
                            <span className="font-mono text-slate-200">{status.memberId}</span>
                          </div>
                        )}
                        {status.expiresAt && (
                          <div className="flex items-center gap-1.5 bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700/50">
                            <Clock className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Token expires:</span>
                            <span className="text-slate-200">
                              {new Date(status.expiresAt).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700/50">
                          <Shield className="w-3.5 h-3.5 text-emerald-400" />
                          <span>AES-256-GCM Encrypted</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Connect / Reconnect Button */}
                <div className="sm:self-center shrink-0">
                  <button
                    onClick={handleConnectLinkedIn}
                    disabled={connecting || statusLoading}
                    className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 shadow-md ${
                      status.connected
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600'
                        : 'bg-[#0A66C2] hover:bg-[#004182] text-white shadow-[#0A66C2]/25 hover:shadow-lg hover:shadow-[#0A66C2]/30 active:scale-[0.98]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {connecting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Redirecting to LinkedIn...</span>
                      </>
                    ) : status.connected ? (
                      <>
                        <RefreshCw className="w-4 h-4 text-slate-400" />
                        <span>Reconnect</span>
                      </>
                    ) : (
                      <>
                        <LinkedInIcon className="w-4 h-4 fill-current" />
                        <span>Connect LinkedIn</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy & Security Card */}
          <div className="rounded-2xl bg-slate-900/40 border border-slate-800/60 p-5 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 font-medium text-slate-300">
              <Shield className="w-4 h-4 text-indigo-400" />
              <span>Token Security & Privacy</span>
            </div>
            <p>
              Your OAuth access tokens and refresh tokens are encrypted on disk using AES-256-GCM authenticated
              encryption. Plaintext credentials and secret tokens are never sent to your browser or exposed via public
              APIs.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
