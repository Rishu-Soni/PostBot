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
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { batchService } from '../../services/batchService';
import { postService } from '../../services/postService';
import { useToast } from '../../context/ToastContext';
import { useCredits } from '../../context/CreditsContext';
import { PostCard } from '../../components/posts/PostCard';
import { Badge } from '../../components/common/Badge';
import { Skeleton } from '../../components/common/Skeleton';
import { Modal } from '../../components/common/Modal';

export const BatchDetailPage = () => {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { refreshBalance } = useCredits();

  const [batch, setBatch] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingPosts, setRetryingPosts] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Reschedule post date/time
  const handleUpdatePostDate = async (postId, newScheduledTime) => {
    try {
      const updatedPost = await postService.updatePost(postId, { scheduledTime: newScheduledTime });
      setPosts((prev) => prev.map((p) => (p._id === postId ? updatedPost : p)));
      if (batch?.status === 'exhausted') {
        setBatch((prev) => (prev ? { ...prev, status: 'active' } : prev));
      }
      if (refreshBalance) {
        refreshBalance();
      }
      showToast('Post schedule updated successfully!', 'success');
      return updatedPost;
    } catch (err) {
      showToast(err.message || 'Failed to update post schedule.', 'error');
      throw err;
    }
  };

  // Retry immediate publishing on failed post
  const handleRetryPostNow = async (postId) => {
    setRetryingPosts((prev) => ({ ...prev, [postId]: true }));
    try {
      const updatedPost = await postService.postNow(postId);
      setPosts((prev) => prev.map((p) => (p._id === postId ? updatedPost : p)));
      if (refreshBalance) {
        refreshBalance();
      }
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

  // Delete batch (cancels remaining scheduled posts and refunds credits for unposted posts)
  const handleDeleteBatch = async () => {
    setIsDeleting(true);
    try {
      const res = await batchService.deleteBatch(batchId);
      const refunded = res?.data?.refundedCredits;
      if (refunded && refunded > 0) {
        showToast(
          `Batch deleted. ${refunded} credit${refunded > 1 ? 's' : ''} refunded for unposted post${refunded > 1 ? 's' : ''}.`,
          'info'
        );
      } else {
        showToast('Batch and scheduled posts deleted successfully.', 'info');
      }
      if (refreshBalance) {
        refreshBalance();
      }
      navigate('/batches');
    } catch (err) {
      showToast(err.message || 'Failed to delete batch.', 'error');
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto py-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Skeleton className="h-96 rounded-2xl" />
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

        {/* Metric Counter / Progress Summary & Actions */}
        <div className="flex flex-wrap items-center gap-4 border-t md:border-t-0 md:border-l border-border-warm pt-4 md:pt-0 md:pl-8">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="p-1 rounded bg-surface text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </span>
            <span className="font-semibold text-ink">{postedCount}</span> Posted
          </div>

          <div className="h-4 w-[1px] bg-border-warm" />

          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="p-1 rounded bg-brand-soft text-brand">
              <Clock className="w-4 h-4" />
            </span>
            <span className="font-semibold text-brand">{pendingCount}</span> Pending
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

          <div className="h-4 w-[1px] bg-border-warm" />

          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer active:scale-98"
            title="Delete this batch"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Batch</span>
          </button>
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
            className="px-4 py-2 bg-brand hover:bg-brand-hover text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Start New Batch</span>
          </button>
        </div>
      )}

      {/* Responsive Scheduled Posts Grid */}
      <section
        className={`grid gap-6 ${
          posts.length === 1
            ? 'grid-cols-1 max-w-xl mx-auto'
            : posts.length === 2
            ? 'grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto'
            : posts.length === 3
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
        }`}
      >
        {posts.map((post) => (
          <PostCard
            key={post._id}
            post={post}
            dayIndex={post.dayIndex}
            mode="scheduled"
            onRetryPostNow={handleRetryPostNow}
            onUpdateDate={handleUpdatePostDate}
            isBusy={Boolean(retryingPosts[post._id])}
            busyActionText="Publishing to LinkedIn now..."
          />
        ))}
      </section>

      {/* Delete Batch Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => !isDeleting && setShowDeleteModal(false)}
        title="Delete Content Batch?"
        description="Are you sure you want to delete this batch and cancel its scheduled posts?"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">This action cannot be undone.</p>
              <p className="text-rose-700">
                All posts in this batch will be permanently removed.
                {pendingCount > 0
                  ? ` ${pendingCount} pending scheduled post${pendingCount > 1 ? 's' : ''} will be cancelled and ${pendingCount} credit${pendingCount > 1 ? 's' : ''} refunded.`
                  : ' Any remaining schedule will be stopped.'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
              className="px-4 py-2 rounded-lg border border-border-warm bg-white hover:bg-surface text-xs font-semibold text-ink transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteBatch}
              disabled={isDeleting}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isDeleting ? 'Deleting...' : 'Delete Batch'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
