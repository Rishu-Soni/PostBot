import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Coins,
  ExternalLink,
  Clock,
  Check,
  ShieldCheck,
  Settings,
  ArrowRight,
} from 'lucide-react';
import { notificationService } from '../../services/notificationService';
import { useToast } from '../../context/ToastContext';
import { Skeleton } from '../../components/common/Skeleton';

const NOTIF_TABS = [
  { label: 'Unresolved', value: 'false' },
  { label: 'All Alerts', value: 'all' },
  { label: 'Resolved', value: 'true' },
];

export const NotificationsPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [notifications, setNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState('false');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvingIds, setResolvingIds] = useState({});

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const resolvedParam = activeTab === 'all' ? undefined : activeTab === 'true';
      const data = await notificationService.getNotifications({
        page,
        limit: 15,
        resolved: resolvedParam,
      });
      setNotifications(data.notifications || []);
      setTotal(data.total || 0);
    } catch (err) {
      showToast(err.message || 'Failed to load notifications.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [activeTab, page]);

  const handleResolve = async (id) => {
    setResolvingIds((prev) => ({ ...prev, [id]: true }));
    try {
      await notificationService.resolveNotification(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, resolved: true } : n))
      );
      showToast('Notification marked as resolved.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to resolve notification.', 'error');
    } finally {
      setResolvingIds((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }
  };

  const getNotificationIcon = (type, resolved) => {
    switch (type) {
      case 'token_expired':
        return <KeyRound className="w-5 h-5 text-amber-600" />;
      case 'posting_failure':
        return <AlertCircle className="w-5 h-5 text-rose-600" />;
      case 'low_stock':
        return <Coins className="w-5 h-5 text-brand" />;
      default:
        return <Bell className="w-5 h-5 text-ink-muted" />;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in py-2">
      {/* Section Header Block */}
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-brand-soft border border-brand/20 text-[11px] font-bold text-brand tracking-wide uppercase">
          Activity &amp; System Health
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
          Notifications &amp; Alerts
        </h1>
        <p className="text-sm text-ink-muted">
          System notices for failed LinkedIn publications, token expirations, and weekly queue events.
        </p>
      </div>

      {/* Segmented Controls & Global Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border-warm">
        {/* Segmented Tab Filter */}
        <div className="inline-flex p-1 rounded-xl bg-surface-card border border-border-warm shadow-xs">
          {NOTIF_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setActiveTab(tab.value);
                setPage(1);
              }}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === tab.value
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Preferences Link */}
        <Link
          to="/settings"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-brand transition-colors"
        >
          <Settings className="w-3.5 h-3.5 text-ink-subtle" />
          <span>Notification Preferences</span>
        </Link>
      </div>

      {/* Main Alerts Feed or Empty State */}
      {isLoading ? (
        <div className="space-y-3.5">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : notifications.length === 0 ? (
        /* Empty State Card matching code12.html */
        <section className="bg-surface-card border border-border-warm rounded-2xl shadow-sm overflow-hidden">
          {/* Architectural Header Strip */}
          <div className="px-6 py-2.5 border-b border-border-light bg-surface/50 flex items-center justify-between text-[11px] font-mono text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>SYSTEM STATUS: NORMAL</span>
            </span>
            <span>QUEUE: ACTIVE</span>
          </div>

          {/* Empty State Core Content */}
          <div className="px-8 pt-12 pb-10 flex flex-col items-center text-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-2xl bg-brand-soft border border-brand/20 flex items-center justify-center transform rotate-2">
                <div className="w-16 h-16 rounded-xl bg-white shadow-sm border border-border-warm flex items-center justify-center -rotate-2">
                  <ShieldCheck className="w-8 h-8 text-brand" />
                </div>
              </div>
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="relative inline-flex rounded-full h-4 w-4 bg-coral text-white items-center justify-center text-[9px] font-bold">
                  ✓
                </span>
              </span>
            </div>

            <h2 className="text-xl font-bold tracking-tight text-ink mb-2">All Caught Up!</h2>
            <p className="text-ink-muted text-sm max-w-md leading-relaxed mb-8">
              No active alerts or failure notices at this time. Your automated LinkedIn posting pipeline is running smoothly.
            </p>

            {/* Pipeline Health Checklist */}
            <div className="w-full max-w-xl bg-surface/60 rounded-xl border border-border-warm p-4 text-left">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-light">
                <span className="text-xs font-bold text-ink tracking-wider uppercase">
                  Active Pipeline Integrity
                </span>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded">
                  100% HEALTHY
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white p-3 rounded-lg border border-border-warm shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-[11px] font-semibold text-ink">LinkedIn OAuth</span>
                  </div>
                  <p className="text-[10px] text-ink-muted">Token valid</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-border-warm shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full bg-brand"></span>
                    <span className="text-[11px] font-semibold text-ink">Batch Engine</span>
                  </div>
                  <p className="text-[10px] text-ink-muted">Ready for intake</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-border-warm shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span className="text-[11px] font-semibold text-ink">Email Alerts</span>
                  </div>
                  <p className="text-[10px] text-ink-muted">Delivery configured</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card Bottom Bar */}
          <div className="px-6 py-3 bg-surface/40 border-t border-border-light flex items-center justify-between text-xs text-ink-muted">
            <span>Notifications are dispatched via Webhook and Email according to your rules.</span>
            <Link to="/settings" className="text-brand font-semibold hover:underline text-xs">
              Configure Channels →
            </Link>
          </div>
        </section>
      ) : (
        /* Feed of Notification Cards matching code13.html */
        <div className="space-y-3.5">
          {notifications.map((item) => {
            const isResolved = item.resolved;
            const isBusy = Boolean(resolvingIds[item._id]);
            const isCritical = item.type === 'posting_failure' || item.type === 'token_expired';

            return (
              <article
                key={item._id}
                className={`p-5 md:p-6 rounded-2xl border transition-all duration-200 ${
                  isResolved
                    ? 'bg-surface/40 border-border-light opacity-75'
                    : isCritical
                    ? 'bg-white border-2 border-coral/30 shadow-sm hover:border-coral'
                    : 'bg-surface-card border-border-warm shadow-sm hover:border-brand/40'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon Badge */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
                      isResolved
                        ? 'bg-surface border-border-warm text-ink-muted'
                        : isCritical
                        ? 'bg-coral-soft border-coral/20 text-coral'
                        : 'bg-brand-soft border-brand/20 text-brand'
                    }`}
                  >
                    {getNotificationIcon(item.type, isResolved)}
                  </div>

                  {/* Main Body */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-base font-bold text-ink">
                          {item.type === 'token_expired'
                            ? 'LinkedIn OAuth Expired'
                            : item.type === 'posting_failure'
                            ? 'Publishing Failed'
                            : item.type === 'low_stock'
                            ? 'Low Credits Reminder'
                            : 'System Notification'}
                        </h2>
                        {isResolved ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface text-ink-muted border border-border-warm">
                            <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
                            <span>Resolved</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-coral-soft text-coral border border-coral/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-coral"></span>
                            Needs Action
                          </span>
                        )}
                      </div>
                      <time className="text-xs text-ink-subtle font-medium">
                        {new Date(item.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </div>

                    <p className="text-sm text-ink-muted leading-relaxed">
                      {item.message}
                    </p>

                    {/* Footer Metadata & Action Buttons */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border-light">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-ink-subtle font-medium">Dispatched via:</span>
                        {Array.isArray(item.channels) && item.channels.length > 0 ? (
                          item.channels.map((ch) => (
                            <span
                              key={ch}
                              className="px-2 py-0.5 rounded bg-surface text-[10px] font-bold text-ink-muted border border-border-light uppercase"
                            >
                              {ch}
                            </span>
                          ))
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-surface text-[10px] font-bold text-ink-muted border border-border-light uppercase">
                            IN-APP
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {item.type === 'token_expired' && !isResolved && (
                          <button
                            type="button"
                            onClick={() => navigate('/settings')}
                            className="inline-flex items-center gap-1 text-xs font-bold text-coral hover:text-coral-hover cursor-pointer"
                          >
                            <span>Reconnect LinkedIn</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {!isResolved && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleResolve(item._id)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:text-brand-hover cursor-pointer"
                          >
                            <span>{isBusy ? 'Resolving...' : 'Mark as Resolved'}</span>
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {/* Pagination */}
          {total > 15 && (
            <div className="flex items-center justify-between pt-4 text-xs text-ink-muted">
              <span>
                Showing {(page - 1) * 15 + 1} to {Math.min(page * 15, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-border-warm bg-white hover:bg-surface text-xs font-semibold text-ink disabled:opacity-40 transition-colors cursor-pointer"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page * 15 >= total}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-border-warm bg-white hover:bg-surface text-xs font-semibold text-ink disabled:opacity-40 transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
