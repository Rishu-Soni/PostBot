import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Zap,
  LogOut,
  User,
  Menu,
  Plus,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCredits } from '../../context/CreditsContext';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { LinkedInIcon } from '../common/LinkedInIcon';

export const Navbar = ({ onToggleSidebar }) => {
  const { user, logout } = useAuth();
  const { creditBalance } = useCredits();
  const navigate = useNavigate();
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showLinkedInModal, setShowLinkedInModal] = useState(false);

  const isLinkedInConnected = Boolean(user?.linkedin?.isConnected);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 sm:px-6 bg-surface/80 backdrop-blur-md border-b border-border-light">
        {/* Left side: mobile toggle + brand on mobile */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-2 text-ink-muted hover:text-ink rounded-lg hover:bg-canvas lg:hidden"
            aria-label="Toggle Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="lg:hidden flex items-center gap-2 font-bold text-ink tracking-tight">
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center text-white text-xs shadow-sm">
              PB
            </div>
            <span>PostBot</span>
          </div>
        </div>

        {/* Right side: persistent status chips & user profile */}
        <div className="flex items-center gap-2.5 sm:gap-3 ml-auto">
          {/* Credit balance chip */}
          <button
            type="button"
            onClick={() => setShowBuyModal(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-full bg-surface-card hover:bg-canvas border border-border-warm text-ink transition-all hover:shadow-warm-sm text-xs sm:text-sm font-semibold cursor-pointer"
            title="Credit balance — click for details"
          >
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand" />
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
                : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
            }`}
            title={isLinkedInConnected ? 'LinkedIn Connected' : 'LinkedIn Disconnected — Click to connect'}
          >
            <LinkedInIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isLinkedInConnected ? 'bg-green-500 animate-pulse' : 'bg-red-400'
                }`}
              />
              <span className="hidden md:inline">
                {isLinkedInConnected ? 'Connected' : 'Not Connected'}
              </span>
            </span>
          </button>

          {/* Quick "New Batch" action button */}
          <Link
            to="/batches/new"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-coral hover:bg-coral-hover text-white shadow-coral transition-all active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Batch</span>
          </Link>

          {/* User profile quick link */}
          <div className="flex items-center pl-2 border-l border-border-warm">
            <Link
              to="/settings"
              className="flex items-center gap-2 p-1 text-ink-muted hover:text-ink rounded-lg hover:bg-canvas transition-colors"
              title={`Settings (${user?.email})`}
            >
              <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white text-xs font-bold ring-2 ring-surface">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
            </Link>
          </div>
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
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {isLinkedInConnected ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
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
