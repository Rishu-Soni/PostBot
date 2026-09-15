import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Layers,
  PlusCircle,
  Calendar,
  ChevronRight,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { batchService } from '../../services/batchService';
import { useToast } from '../../context/ToastContext';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { Skeleton } from '../../components/common/Skeleton';

const STATUS_TABS = [
  { label: 'All Batches', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Drafts', value: 'draft' },
  { label: 'Completed', value: 'exhausted' },
];

export const BatchesListPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [batches, setBatches] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBatches = async () => {
    setIsLoading(true);
    try {
      const data = await batchService.getBatches({
        page,
        limit: 10,
        status: activeTab,
      });
      setBatches(data.batches || []);
      setTotal(data.total || 0);
    } catch (err) {
      showToast(err.message || 'Failed to load batches.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, [activeTab, page]);

  // Client-side search filtering on current page
  const filteredBatches = batches.filter((b) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      b.theme?.toLowerCase().includes(query) ||
      b.brainDump?.toLowerCase().includes(query) ||
      b.status?.toLowerCase().includes(query)
    );
  });

  const activeCount = batches.filter((b) => b.status === 'active').length;
  const draftCount = batches.filter((b) => b.status === 'draft').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in py-2">
      {/* Page Title & Header Block */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand uppercase tracking-wider bg-brand-soft px-2.5 py-0.5 rounded-md border border-brand/20">
              Content Pipeline
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-ink tracking-tight">Content Batches</h1>
          <p className="text-sm text-ink-muted mt-1">
            Track, manage, and inspect your weekly LinkedIn batches across drafts, active schedules, and archives.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Summary Stats Pill */}
          <div className="bg-surface-card border border-border-warm rounded-xl px-4 py-2.5 shadow-sm flex items-center gap-4 text-xs font-semibold text-ink-muted hidden sm:flex">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand"></span>
              <span><strong className="text-ink font-bold">{total}</strong> Batches</span>
            </div>
            <div className="h-3.5 w-[1px] bg-border-warm"></div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span><strong className="text-ink font-bold">{activeCount}</strong> Active</span>
            </div>
            <div className="h-3.5 w-[1px] bg-border-warm"></div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span><strong className="text-ink font-bold">{draftCount}</strong> Drafts</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/batches/new')}
            className="bg-coral hover:bg-coral-hover text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Weekly Batch</span>
          </button>
        </div>
      </section>

      {/* Filter, Search & Controls Toolbar */}
      <section className="bg-surface-card border border-border-warm rounded-2xl p-2.5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Segmented Tab Pills */}
        <div className="flex items-center gap-1 overflow-x-auto p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setActiveTab(tab.value);
                setPage(1);
              }}
              className={`text-xs font-semibold px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab.value
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[240px]">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-ink-subtle">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search batches, themes..."
            className="w-full bg-surface border border-border-warm text-xs rounded-xl pl-9 pr-3 py-2 text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
          />
        </div>
      </section>

      {/* Batches Cards List */}
      {isLoading ? (
        <div className="space-y-3.5">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : filteredBatches.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={`No ${activeTab === 'all' ? '' : activeTab} batches found`}
          description={
            activeTab === 'all'
              ? 'You have not created any batches yet. Start by turning a quick brain dump into a week of LinkedIn posts.'
              : `There are currently no batches with the status "${activeTab}".`
          }
          actionLabel={activeTab === 'all' ? 'Create First Batch' : undefined}
          onAction={activeTab === 'all' ? () => navigate('/batches/new') : undefined}
          actionIcon={PlusCircle}
        />
      ) : (
        <section className="space-y-3.5">
          {filteredBatches.map((batch) => {
            const isDraft = batch.status === 'draft';
            const isActive = batch.status === 'active';
            const isCompleted = batch.status === 'exhausted';
            const targetUrl = isDraft
              ? `/batches/${batch._id}/review`
              : `/batches/${batch._id}`;
            const daysCount = batch.finalDayCount || batch.recommendedDayCount || 0;

            return (
              <article
                key={batch._id}
                onClick={() => navigate(targetUrl)}
                className={`rounded-2xl p-5 shadow-sm transition-all duration-200 cursor-pointer group ${
                  isDraft
                    ? 'bg-[#FFFDFB] border-2 border-coral/40 hover:border-coral hover:shadow-md'
                    : 'bg-surface-card border border-border-warm hover:border-brand/40 hover:shadow-md'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Content */}
                  <div className="space-y-2.5 max-w-3xl min-w-0">
                    {/* Meta Badges Line */}
                    <div className="flex items-center flex-wrap gap-2 text-xs">
                      {isActive && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold bg-[#EBF7F2] text-[#18754B] border border-[#C6ECD7]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#20B06B]"></span>
                          Active Schedule
                        </span>
                      )}
                      {isDraft && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Draft Review Needed
                        </span>
                      )}
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold bg-surface text-ink-muted border border-border-warm">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Completed
                        </span>
                      )}

                      <span className="font-medium text-ink-muted bg-surface border border-border-warm px-2.5 py-0.5 rounded-md">
                        {daysCount} Days Arc
                      </span>

                      <span className="text-ink-subtle text-xs">•</span>

                      <span className="text-ink-subtle text-xs font-medium">
                        Created{' '}
                        {new Date(batch.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>

                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand bg-brand-soft px-2 py-0.5 rounded-md">
                          <Clock className="w-3 h-3" />
                          <span>Daily publishing active</span>
                        </span>
                      )}
                    </div>

                    {/* Batch Title */}
                    <h2 className="text-lg font-bold text-ink group-hover:text-brand transition-colors truncate">
                      {batch.theme || 'Weekly Thought Leadership Arc'}
                    </h2>

                    {/* Hook / Content Preview */}
                    {batch.brainDump && (
                      <p className="text-xs text-ink-muted leading-relaxed italic line-clamp-1">
                        &quot;{batch.brainDump.slice(0, 160)}...&quot;
                      </p>
                    )}

                    {/* Style / Tone Tag */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="text-[11px] font-semibold text-ink-muted bg-surface px-2 py-0.5 rounded border border-border-light">
                        {batch.tone || 'Founder Tone'}
                      </span>
                      {batch.writingStyle && (
                        <span className="text-[11px] font-semibold text-ink-muted bg-surface px-2 py-0.5 rounded border border-border-light hidden sm:inline">
                          {batch.writingStyle}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Side Actions */}
                  <div className="flex items-center lg:flex-col lg:items-end justify-between lg:justify-center gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-border-light shrink-0">
                    <span className="text-[11px] text-ink-subtle font-medium">
                      {isDraft ? 'Pending Approval' : `${daysCount} of ${daysCount} Posts`}
                    </span>

                    {isDraft ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 bg-coral hover:bg-coral-hover text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition-all"
                      >
                        <span>Continue Review</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 bg-brand-soft hover:bg-brand hover:text-white text-brand font-bold text-xs px-4 py-2.5 rounded-xl border border-brand/20 transition-all"
                      >
                        <span>View Schedule &amp; Posts</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {/* Pagination Controls */}
          {total > 10 && (
            <div className="flex items-center justify-between pt-4 text-xs text-ink-muted">
              <span>
                Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, total)} of {total} batches
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
                  disabled={page * 10 >= total}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-border-warm bg-white hover:bg-surface text-xs font-semibold text-ink disabled:opacity-40 transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
