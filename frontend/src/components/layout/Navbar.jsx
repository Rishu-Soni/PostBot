import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Zap,
  Menu,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCredits } from '../../context/CreditsContext';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { LinkedInIcon } from '../common/LinkedInIcon';
import { Logo } from '../common/Logo';

export const Navbar = ({ onToggleSidebar }) => {
  const { user } = useAuth();
  const { creditBalance } = useCredits();
  const navigate = useNavigate();
  const location = useLocation();
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showLinkedInModal, setShowLinkedInModal] = useState(false);

  const isLinkedInConnected = Boolean(user?.linkedin?.isConnected);
  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/';

  const getBreadcrumb = () => {
    if (location.pathname.startsWith('/batches/new')) {
      return { section: 'Batches', page: 'New Weekly Batch' };
    }
    if (location.pathname.startsWith('/batches')) {
      return { section: 'Batches', page: 'Batch Management' };
    }
    if (location.pathname.startsWith('/credits')) {
      return { section: 'Credits', page: 'Ledger & Usage' };
    }
    if (location.pathname.startsWith('/notifications')) {
      return { section: 'Notifications', page: 'Alerts' };
    }
    if (location.pathname.startsWith('/settings')) {
      return { section: 'Settings', page: 'Account & Integrations' };
    }
    return { section: 'Dashboard', page: 'Overview' };
  };

  const breadcrumb = getBreadcrumb();

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 sm:px-6 bg-white/85 backdrop-blur-md border-b border-[#E2E8F0]">
        {/* Left side: mobile toggle + brand on mobile + breadcrumb on desktop */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-2 text-ink-muted hover:text-ink rounded-lg hover:bg-slate-100 lg:hidden"
            aria-label="Toggle Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="lg:hidden flex items-center gap-2 font-bold text-ink tracking-tight">
            <Logo size="sm" />
            <span>PostBot</span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded bg-[#E2E8F0] text-[#64748B]">
              PRO
            </span>
          </div>

          {/* Desktop Left-Aligned Context Breadcrumb */}
          <div className="hidden lg:flex items-center gap-2 text-sm select-none">
            <span className="text-[#64748B] font-normal">{breadcrumb.section}</span>
            <span className="text-slate-300">/</span>
            <span className="text-[#0F172A] font-medium">{breadcrumb.page}</span>
          </div>
        </div>

        {/* Right side: persistent status chips or subtle help guide link on dashboard */}
        <div className="flex items-center gap-3 ml-auto">
          {isDashboard ? (
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Open PostBot Quickstart & Workflow Guide"
            >
              <HelpCircle className="w-3.5 h-3.5 text-[#94A3B8]" />
              <span>Need help? Guide</span>
            </button>
          ) : (
            <>
              {/* Credit balance chip */}
              <button
                type="button"
                onClick={() => setShowBuyModal(true)}
                className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-[#E2E8F0] text-ink transition-all text-xs sm:text-sm font-semibold cursor-pointer shadow-2xs"
                title="Credit balance — click for details"
              >
                <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#1E88E5]" />
                <span>{creditBalance}</span>
                <span className="hidden sm:inline font-normal text-ink-muted">Credits</span>
              </button>

              {/* LinkedIn connection status indicator */}
              <button
                type="button"
                onClick={() => setShowLinkedInModal(true)}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-full border text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                  isLinkedInConnected
                    ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                    : 'bg-slate-100/90 border-slate-200 text-slate-700 hover:bg-slate-200/60'
                }`}
                title={isLinkedInConnected ? 'LinkedIn Connected' : 'LinkedIn Not Connected — Click to connect'}
              >
                <LinkedInIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isLinkedInConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
                    }`}
                  />
                  <span className="hidden md:inline">
                    {isLinkedInConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Credit balance detail / Buy modal */}
      <Modal
        isOpen={showBuyModal}
        onClose={() => setShowBuyModal(false)}
        title="Credit Balance & Top-Up"
        description="Credits power AI drafting, post generation, and image synthesis."
      >
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-brand-soft border border-brand/15 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand">
              Current Balance
            </span>
            <div className="text-4xl font-extrabold text-ink mt-1 flex items-center justify-center gap-2">
              <Zap className="w-7 h-7 text-brand" />
              <span>{creditBalance}</span>
            </div>
            <p className="text-xs text-ink-muted mt-2">
              1 credit = 1 full post generation or AI regeneration
            </p>
          </div>

          <div className="p-4 rounded-xl bg-canvas border border-border-light text-xs text-ink-muted space-y-2">
            <div className="flex justify-between">
              <span>Full batch generation:</span>
              <span className="font-semibold text-ink">1 credit / post</span>
            </div>
            <div className="flex justify-between">
              <span>AI caption / image regeneration:</span>
              <span className="font-semibold text-ink">1 credit / run</span>
            </div>
            <div className="flex justify-between">
              <span>Manual text editing & custom image uploads:</span>
              <span className="font-semibold text-green-600">Free & unlimited</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="outline"
              disabled
              className="w-full relative group cursor-not-allowed opacity-75"
            >
              <span>Buy Credits</span>
              <span className="ml-2 text-xs py-0.5 px-1.5 rounded bg-brand-soft text-brand border border-brand/20">
                Coming Soon
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowBuyModal(false);
                navigate('/credits');
              }}
            >
              View Transaction History
            </Button>
          </div>
        </div>
      </Modal>

      {/* LinkedIn Status Modal */}
      <Modal
        isOpen={showLinkedInModal}
        onClose={() => setShowLinkedInModal(false)}
        title="LinkedIn Account Integration"
        description="PostBot schedules and publishes content directly to your personal LinkedIn profile."
      >
        <div className="space-y-4">
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              isLinkedInConnected
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            {isLinkedInConnected ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-brand shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-semibold text-sm">
                {isLinkedInConnected
                  ? 'LinkedIn Profile Connected'
                  : 'LinkedIn Account Not Connected'}
              </div>
              <p className="text-xs opacity-80 mt-1 leading-relaxed">
                {isLinkedInConnected
                  ? `Your account is authenticated for automated posting. Connected since ${
                      user?.linkedin?.connectedAt
                        ? new Date(user.linkedin.connectedAt).toLocaleDateString()
                        : 'recent session'
                    }.`
                  : 'You must connect your LinkedIn profile before confirming and scheduling weekly batches.'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowLinkedInModal(false);
              }}
            >
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setShowLinkedInModal(false);
                navigate('/settings');
              }}
              icon={ExternalLink}
              iconPosition="right"
            >
              {isLinkedInConnected ? 'Manage in Settings' : 'Connect LinkedIn Now'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
