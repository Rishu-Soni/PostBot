import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Calendar,
  Layers,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  PlusCircle,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import { batchService } from '../../services/batchService';
import { postService } from '../../services/postService';
import { useToast } from '../../context/ToastContext';
import { PostCard } from '../../components/posts/PostCard';
import { Badge } from '../../components/common/Badge';
import { Skeleton } from '../../components/common/Skeleton';

export const BatchDetailPage = () => {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [batch, setBatch] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingPosts, setRetryingPosts] = useState({});

  const loadBatchDetails = async () => {
    try {
      const data = await batchService.getBatchById(batchId);
      setBatch(data.batch);
      setPosts(data.posts || []);
    } catch (err) {
      showToast(err.message || 'Failed to load batch details.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBatchDetails();
  }, [batchId]);

  // Retry immediate publishing on failed post
  const handleRetryPostNow = async (postId) => {
    setRetryingPosts((prev) => ({ ...prev, [postId]: true }));
    try {
      const updatedPost = await postService.postNow(postId);
      setPosts((prev) => prev.map((p) => (p._id === postId ? updatedPost : p)));
      showToast('Post successfully published to LinkedIn!', 'success');
    } catch (err) {
      showToast(err.message || 'Retry failed. Check LinkedIn connection.', 'error');
    } finally {
      setRetryingPosts((prev) => {
        const copy = { ...prev };
        delete copy[postId];
        return copy;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto py-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  const isExhausted = batch?.status === 'exhausted';
  const postedCount = posts.filter((p) => p.status === 'posted').length;
  const failedCount = posts.filter((p) => p.status === 'failed').length;
  const pendingCount = posts.filter((p) => p.status === 'pending').length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-fade-in py-2">
      {/* Breadcrumb / Back button */}
      <div>
        <Link
          to="/batches"
          className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-brand transition-colors group"
        >
          <span className="p-1.5 rounded-lg bg-surface border border-border-warm group-hover:border-brand/30 transition-colors">
            <ArrowLeft className="w-4 h-4 text-ink-muted group-hover:text-brand" />
          </span>
          <span>Back to All Batches</span>
        </Link>
      </div>

      {/* Batch Metadata Header Banner */}
      <section className="bg-surface-card rounded-2xl border border-border-warm p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          {/* Tags & Schedule indicator */}
          <div className="flex items-center gap-2.5 mb-2">
            <Badge variant={batch?.status} dot size="sm">
              {batch?.status === 'active' ? 'Active' : batch?.status === 'exhausted' ? 'Completed' : batch?.status}
            </Badge>
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
              {posts.length} Scheduled Days
            </span>
          </div>

          {/* Primary Title */}
          <h1 className="text-2xl lg:text-3xl font-bold text-ink tracking-tight">
            {batch?.theme || 'Scheduled Content Batch'}
          </h1>
        </div>

        {/* Metric Counter / Progress Summary */}
        <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-border-warm pt-4 md:pt-0 md:pl-8">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="p-1 rounded bg-surface text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </span>
            <span className="font-semibold text-ink">{postedCount}</span> Posted
          </div>

          <div className="h-4 w-[1px] bg-border-warm" />

          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="p-1 rounded bg-coral-soft text-coral">
              <Clock className="w-4 h-4" />
            </span>
            <span className="font-semibold text-coral">{pendingCount}</span> Pending
          </div>

          {failedCount > 0 && (
            <>
              <div className="h-4 w-[1px] bg-border-warm" />
              <div className="flex items-center gap-2 text-sm text-rose-600">
                <span className="p-1 rounded bg-rose-50 text-rose-600">
                  <AlertCircle className="w-4 h-4" />
                </span>
                <span className="font-semibold">{failedCount}</span> Failed
              </div>
            </>
          )}
        </div>
      </section>

      {/* Exhausted Banner if complete */}
      {isExhausted && (
        <div className="p-5 rounded-2xl bg-brand-soft border border-brand/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <span className="font-bold text-ink text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-brand" />
              This batch is complete!
            </span>
            <p className="text-xs text-ink-muted">
              All scheduled posts for this cycle have finished. Ready for your next weekly arc?
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/batches/new')}
            className="px-4 py-2 bg-coral hover:bg-coral-hover text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Start New Batch</span>
          </button>
        </div>
      )}

      {/* 3-Column Scheduled Posts Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {posts.map((post) => (
          <PostCard
            key={post._id}
            post={post}
            dayIndex={post.dayIndex}
            mode="scheduled"
            onRetryPostNow={handleRetryPostNow}
            isBusy={Boolean(retryingPosts[post._id])}
            busyActionText="Publishing to LinkedIn now..."
          />
        ))}
      </section>
    </div>
  );
};
