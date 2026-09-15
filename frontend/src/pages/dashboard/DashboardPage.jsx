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
          <p className="text-sm text-ink-muted mt-1">
            Your personal LinkedIn publishing engine is configured for{' '}
            <span className="text-ink font-medium">
              {user?.timezone || 'UTC'}
            </span>{' '}
            at{' '}
            <span className="text-ink font-medium">
              {user?.defaultPostTime || '09:00'}
            </span>
            .
          </p>
        </div>

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
      </div>

      {/* Hero Overview Grid — 3 stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* 1. Credit Balance Card */}
        <Card className="p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-brand">
              Credit Balance
            </span>
            <div className="w-8 h-8 rounded-xl bg-brand-soft border border-brand/15 flex items-center justify-center text-brand">
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
          <div className="mt-4 pt-4 border-t border-border-light flex items-center justify-between">
            <Link
              to="/credits"
              className="text-xs text-brand hover:text-brand-hover font-semibold flex items-center gap-1"
            >
              <span>View ledger</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full bg-canvas text-ink-subtle border border-border-light cursor-help"
              title="Self-serve billing integration coming soon"
            >
              Buy More (Soon)
            </span>
          </div>
        </Card>

        {/* 2. LinkedIn Connection Card */}
        <Card className="p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              LinkedIn Integration
            </span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                isLinkedInConnected
                  ? 'bg-green-50 text-green-600 border border-green-200'
                  : 'bg-red-50 text-red-500 border border-red-200'
              }`}
            >
              <LinkedInIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isLinkedInConnected ? 'bg-green-500 animate-pulse' : 'bg-red-400'
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
          <div className="mt-4 pt-4 border-t border-border-light">
            {isLinkedInConnected ? (
              <Link
                to="/settings"
                className="text-xs text-green-600 hover:text-green-700 font-semibold flex items-center gap-1"
              >
                <span>Manage account link</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/settings')}
                className="w-full text-xs py-1.5"
              >
                Connect LinkedIn Profile
              </Button>
            )}
          </div>
        </Card>

        {/* 3. Active Batches Summary */}
        <Card className="p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Publishing Queue
            </span>
            <div className="w-8 h-8 rounded-xl bg-canvas border border-border-warm flex items-center justify-center text-ink-muted">
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
          <div className="mt-4 pt-4 border-t border-border-light">
            <Link
              to="/batches"
              className="text-xs text-brand hover:text-brand-hover font-semibold flex items-center gap-1"
            >
              <span>View all batches</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </Card>
      </div>

      {/* Unresolved Notifications Alert Section */}
      {notifications.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <Bell className="w-4 h-4 text-amber-500" />
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
                className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-800 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-ink block sm:inline mr-2">
                      {n.type === 'token_expired'
                        ? 'LinkedIn Token Expired'
                        : n.type === 'posting_failure'
                        ? 'Publishing Failed'
                        : 'System Alert'}
                    </span>
                    <span className="text-amber-700">{n.message}</span>
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
                      <Badge variant={batch.status} dot size="sm">
                        {batch.status}
                      </Badge>
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
