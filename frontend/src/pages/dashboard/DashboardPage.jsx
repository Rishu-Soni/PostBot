import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Layers,
  Bell,
  ArrowRight,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Zap,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCredits } from '../../context/CreditsContext';
import { useToast } from '../../context/ToastContext';
import { batchService } from '../../services/batchService';
import { notificationService } from '../../services/notificationService';
import { Card, CardContent, CardHeader } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { LinkedInIcon } from '../../components/common/LinkedInIcon';
import { Skeleton } from '../../components/common/Skeleton';

export const DashboardPage = () => {
  const { user } = useAuth();
  const { creditBalance } = useCredits();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [batches, setBatches] = useState([]);
  const [activeBatchesCount, setActiveBatchesCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const isLinkedInConnected = Boolean(user?.linkedin?.isConnected);

  useEffect(() => {
    let isMounted = true;

    const loadDashboardData = async () => {
      setIsLoading(true);
      try {
        const [batchData, notifData] = await Promise.allSettled([
          batchService.getBatches({ limit: 5 }),
          notificationService.getNotifications({ resolved: false, limit: 3 }),
        ]);

        if (isMounted) {
          if (batchData.status === 'fulfilled' && batchData.value?.batches) {
            const list = batchData.value.batches;
            setBatches(list);
            const activeCount = list.filter(
              (b) => b.status === 'active' || b.status === 'confirmed'
            ).length;
            setActiveBatchesCount(activeCount);
          }
          if (notifData.status === 'fulfilled' && notifData.value?.notifications) {
            setNotifications(notifData.value.notifications);
          }
        }
      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleResolveNotification = async (id) => {
    try {
      await notificationService.resolveNotification(id);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
      showToast('Notification marked as resolved.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to resolve notification.', 'error');
    }
  };

  const hasBatches = batches.length > 0;

  const getTimezoneLabel = () => {
    let tz = user?.timezone;
    if (!tz || tz.toUpperCase() === 'UTC') {
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      } catch {
        tz = 'UTC';
      }
    }
    let abbr = '';
    try {
      abbr = new Intl.DateTimeFormat(undefined, { timeZone: tz, timeZoneName: 'short' })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value;
    } catch {
      // fallback
    }
    return abbr && abbr !== tz ? `${tz} (${abbr})` : tz;
  };

  const displayTimezoneLabel = getTimezoneLabel();
  const displayTime = user?.defaultPostTime || '09:00';

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Welcome Banner & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-block mb-2">
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand bg-brand-soft rounded-full border border-brand/15">
              Automated Publishing Engine
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
            Welcome, {user?.name || 'Founder'} 👋
          </h1>
          <p className="text-sm text-ink-muted mt-1 flex flex-wrap items-center gap-1.5">
            <span>Your personal LinkedIn publishing engine is configured for</span>
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] text-[#1E88E5] text-[13px] font-semibold transition-colors"
              title="Adjust publishing schedule and timezone"
            >
              <span>{displayTimezoneLabel} at {displayTime}</span>
              <SlidersHorizontal className="w-3 h-3 text-[#1E88E5]" />
            </Link>
            <span>.</span>
          </p>
        </div>

        {hasBatches && (
          <Button
            onClick={() => navigate('/batches/new')}
            variant="primary"
            size="lg"
            icon={ArrowRight}
            iconPosition="right"
            className="shrink-0"
          >
            Start New Weekly Batch
          </Button>
        )}
      </div>

      {/* Hero Overview Grid — 3 stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
        {/* 1. Credit Balance Card */}
        <Card className="p-6 relative overflow-hidden h-full flex flex-col justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                Credit Balance
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1E88E5]">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-ink">{creditBalance}</span>
              <span className="text-xs text-ink-muted">credits available</span>
            </div>
            <p className="text-xs text-ink-muted mt-2">
              1 credit per generated post or AI copy/image revamp.
            </p>
          </div>
          <div className="pt-3 mt-4 border-t border-[#F1F5F9] flex items-center justify-between min-h-[40px]">
            <Link
              to="/credits"
              className="group inline-flex items-center gap-1 text-[13px] font-semibold text-[#1E88E5] hover:text-[#1565C0] transition-colors"
            >
              <span>View ledger</span>
              <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full bg-slate-50 text-[#64748B] border border-[#E2E8F0] cursor-help font-medium"
              title="Self-serve billing integration coming soon"
            >
              Buy More (Soon)
            </span>
          </div>
        </Card>

        {/* 2. LinkedIn Connection Card */}
        <Card className="p-6 relative overflow-hidden h-full flex flex-col justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                LinkedIn Integration
              </span>
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  isLinkedInConnected
                    ? 'bg-green-50 text-green-600 border border-green-200'
                    : 'bg-slate-100/90 text-slate-700 border border-slate-200'
                }`}
              >
                <LinkedInIcon className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isLinkedInConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span className="text-xl font-bold text-ink">
                {isLinkedInConnected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-2">
              {isLinkedInConnected
                ? 'OAuth token active. Automated publishing enabled.'
                : 'Required before scheduling your weekly posts.'}
            </p>
          </div>
          <div className="pt-3 mt-4 border-t border-[#F1F5F9] flex items-center justify-between min-h-[40px]">
            {isLinkedInConnected ? (
              <Link
                to="/settings"
                className="group inline-flex items-center gap-1 text-[13px] font-semibold text-green-600 hover:text-green-700 transition-colors"
              >
                <span>Manage account link</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <Link
                to="/settings"
                className="group inline-flex items-center gap-1 text-[13px] font-semibold text-[#1E88E5] hover:text-[#1565C0] transition-colors"
              >
                <span>Connect LinkedIn profile</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>
        </Card>

        {/* 3. Active Batches Summary */}
        <Card className="p-6 relative overflow-hidden h-full flex flex-col justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                Publishing Queue
              </span>
              <div className="w-8 h-8 rounded-xl bg-slate-50 border border-[#E2E8F0] flex items-center justify-center text-[#64748B]">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-ink">{activeBatchesCount}</span>
              <span className="text-xs text-ink-muted">active batches</span>
            </div>
            <p className="text-xs text-ink-muted mt-2">
              Automated scheduler runs hourly according to your timezone.
            </p>
          </div>
          <div className="pt-3 mt-4 border-t border-[#F1F5F9] flex items-center justify-between min-h-[40px]">
            {batches.length === 0 ? (
              <Link
                to="/batches/new"
                className="group inline-flex items-center gap-1 text-[13px] font-semibold text-[#1E88E5] hover:text-[#1565C0] transition-colors"
              >
                <span>Create first batch</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <Link
                to="/batches"
                className="group inline-flex items-center gap-1 text-[13px] font-semibold text-[#1E88E5] hover:text-[#1565C0] transition-colors"
              >
                <span>View all batches</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>
        </Card>
      </div>

      {/* Unresolved Notifications Alert Section */}
      {notifications.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <Bell className="w-4 h-4 text-brand" />
              <span>Attention Required ({notifications.length})</span>
            </div>
            <Link
              to="/notifications"
              className="text-xs text-brand hover:text-brand-hover font-semibold"
            >
              View all alerts
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {notifications.map((n) => (
              <div
                key={n._id}
                className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-blue-900 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-ink block sm:inline mr-2">
                      {n.type === 'token_expired'
                        ? 'LinkedIn Token Expired'
                        : n.type === 'posting_failure'
                        ? 'Publishing Failed'
                        : 'System Alert'}
                    </span>
                    <span className="text-blue-700">{n.message}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {n.type === 'token_expired' && (
                    <Button
                      size="sm"
                      variant="primary"
                      className="text-xs py-1"
                      onClick={() => navigate('/settings')}
                    >
                      Reconnect
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs py-1"
                    onClick={() => handleResolveNotification(n._id)}
                  >
                    Mark Resolved
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Batches Section / Empty State */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink tracking-tight">Recent Batches</h2>
          {hasBatches && (
            <Link
              to="/batches"
              className="text-xs text-brand hover:text-brand-hover font-semibold flex items-center gap-1"
            >
              <span>See history</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
          </div>
        ) : !hasBatches ? (
          <EmptyState
            icon={Layers}
            title="You haven't created a weekly batch yet"
            description="Dump your raw thoughts, customer stories, or lessons from this week. PostBot turns them into 5 days of structured, formatted LinkedIn posts with photos."
            actionLabel="Start Your First Weekly Batch"
            actionIcon={PlusCircle}
            onAction={() => navigate('/batches/new')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {batches.map((batch) => {
              const isDraft = batch.status === 'draft';
              const targetRoute = isDraft
                ? `/batches/${batch._id}/review`
                : `/batches/${batch._id}`;

              return (
                <Card
                  key={batch._id}
                  hover
                  onClick={() => navigate(targetRoute)}
                  className="p-5 cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={batch.status} dot size="sm">
                          {batch.status}
                        </Badge>
                        {isDraft && (
                          <span
                            className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1"
                            title="Unconfirmed drafts are deleted from the database after 7 days. Confirm and schedule to preserve."
                          >
                            <Clock className="w-2.5 h-2.5 text-amber-600" />
                            {(() => {
                              const exp = batch.expiresAt ? new Date(batch.expiresAt).getTime() : new Date(batch.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000;
                              const diff = exp - Date.now();
                              if (diff <= 0) return 'Expiring soon';
                              const hrs = Math.floor(diff / (1000 * 60 * 60));
                              if (hrs < 24) return `${hrs}h left`;
                              return `${Math.ceil(hrs / 24)}d left`;
                            })()}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-ink-muted font-medium">
                        {batch.finalDayCount || batch.recommendedDayCount} Days
                      </span>
                    </div>

                    <h3 className="text-base font-semibold text-ink line-clamp-1">
                      {batch.theme || 'Weekly Thought Leadership'}
                    </h3>

                    <p className="text-xs text-ink-muted">
                      Created on{' '}
                      {new Date(batch.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>

                  <div className="pt-4 mt-2 border-t border-border-light flex items-center justify-between text-xs font-semibold">
                    <span className="text-brand hover:text-brand-hover flex items-center gap-1">
                      {isDraft ? 'Continue Review & Scheduling' : 'View Schedule & Stats'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-ink-subtle" />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
