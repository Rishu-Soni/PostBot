import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Clock,
  ArrowRight,
  ExternalLink,
  RotateCw,
  Check,
} from 'lucide-react';
import { batchService } from '../../services/batchService';
import { postService } from '../../services/postService';
import { useAuth } from '../../context/AuthContext';
import { useCredits } from '../../context/CreditsContext';
import { useToast } from '../../context/ToastContext';
import { PostCard } from '../../components/posts/PostCard';
import { PostEditDrawer } from '../../components/posts/PostEditDrawer';
import { Modal } from '../../components/common/Modal';
import { Skeleton } from '../../components/common/Skeleton';
import { LinkedInIcon } from '../../components/common/LinkedInIcon';

export const BatchReviewPage = () => {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { creditBalance, refreshBalance } = useCredits();
  const { showToast } = useToast();

  const [batch, setBatch] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Per-card isolated busy state: { [postId]: 'Busy message...' }
  const [busyPosts, setBusyPosts] = useState({});

  // Slide-over edit drawer state
  const [activeEditingPost, setActiveEditingPost] = useState(null);

  // Modals
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const isLinkedInConnected = Boolean(user?.linkedin?.isConnected);

  const loadBatchData = async () => {
    try {
      const data = await batchService.getBatchById(batchId);
      setBatch(data.batch);
      setPosts(data.posts || []);
    } catch (err) {
      showToast(err.message || 'Failed to load batch.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBatchData();
  }, [batchId]);

  // Card-isolated AI regeneration
  const handleRegenerate = async (postId, part) => {
    if (creditBalance < 1) {
      showToast('Insufficient credits. You need at least 1 credit.', 'error');
      return;
    }

    setBusyPosts((prev) => ({ ...prev, [postId]: `Regenerating ${part}...` }));

    try {
      const updatedPost = await postService.regeneratePost(postId, part);
      setPosts((prev) => prev.map((p) => (p._id === postId ? updatedPost : p)));
      refreshBalance();
      showToast(`Regenerated ${part} for Day ${updatedPost.dayIndex} (1 credit spent).`, 'success');
    } catch (err) {
      showToast(err.message || `Failed to regenerate ${part}.`, 'error');
    } finally {
      setBusyPosts((prev) => {
        const copy = { ...prev };
        delete copy[postId];
        return copy;
      });
    }
  };

  // Open edit drawer
  const handleEdit = (post) => {
    setActiveEditingPost(post);
  };

  // Handle drawer updates
  const handlePostUpdated = (updatedPost) => {
    setPosts((prev) => prev.map((p) => (p._id === updatedPost._id ? updatedPost : p)));
    setActiveEditingPost(updatedPost);
  };

  // Confirm and schedule batch
  const handleConfirmSchedule = async () => {
    if (!isLinkedInConnected) {
      showToast('You must connect your LinkedIn account before confirming and scheduling.', 'warning');
      return;
    }

    setIsConfirming(true);
    try {
      await batchService.confirmBatch(batchId);
      showToast('Batch confirmed! Posts have been scheduled to your LinkedIn queue.', 'success');
      navigate(`/batches/${batchId}`);
    } catch (err) {
      showToast(err.message || 'Failed to schedule batch.', 'error');
      setIsConfirming(false);
    }
  };

  // Cancel & delete draft batch
  const handleCancelBatch = async () => {
    setIsCancelling(true);
    try {
      await batchService.cancelBatch(batchId);
      showToast('Batch draft cancelled and deleted.', 'info');
      navigate('/dashboard');
    } catch (err) {
      showToast(err.message || 'Failed to cancel batch.', 'error');
      setIsCancelling(false);
    }
  };

  // Retry generating a missing day
  const handleRetryMissingDay = async () => {
    try {
      setIsLoading(true);
      const res = await batchService.updateDayCount(batchId, batch?.finalDayCount || batch?.recommendedDayCount);
      setBatch(res.batch);
      setPosts(res.posts || []);
      refreshBalance();
      showToast('Generated missing day successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to generate missing day.', 'error');
    } finally {
      setIsLoading(false);
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

  const finalCount = batch?.finalDayCount || batch?.recommendedDayCount || posts.length;
  const dayIndices = Array.from({ length: finalCount }, (_, i) => i + 1);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-32 animate-fade-in py-2">
      {/* Batch Overview Banner */}
      <section className="bg-surface-card rounded-2xl border border-border-warm p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            {/* Draft Stage Badge */}
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              <span>Draft Review</span>
              <span className="text-amber-300">|</span>
              <span className="font-medium text-amber-700">{posts.length} of {finalCount} Posts Generated</span>
            </div>

            {/* Batch Title */}
            <h1 className="text-2xl font-bold text-ink tracking-tight">
              {batch?.theme || 'Weekly Draft Review'}
            </h1>
            <p className="text-xs text-ink-muted">
              Review your weekly posts below. Manual copy edits and image uploads are free &amp; unlimited.
            </p>
          </div>

          {/* Cancel Draft Option */}
          <div className="flex items-center self-start md:self-center">
            <button
              type="button"
              onClick={() => setShowCancelModal(true)}
              className="text-xs font-semibold text-ink-muted hover:text-rose-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-rose-50 border border-transparent hover:border-rose-200 cursor-pointer"
            >
              Cancel Draft
            </button>
          </div>
        </div>
      </section>

      {/* 3-Column Post Cards Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dayIndices.map((day) => {
          const post = posts.find((p) => p.dayIndex === day);
          const isBusy = post ? Boolean(busyPosts[post._id]) : false;
          const busyText = post ? busyPosts[post._id] : '';

          return (
            <PostCard
              key={day}
              post={post}
              dayIndex={day}
              mode="review"
              isMissing={!post}
              onRetryMissing={handleRetryMissingDay}
              onEdit={handleEdit}
              onRegenerate={handleRegenerate}
              onUploadImage={handleEdit}
              isBusy={isBusy}
              busyActionText={busyText}
            />
          );
        })}
      </section>

      {/* Slide-over Edit & Regenerate Drawer */}
      <PostEditDrawer
        isOpen={Boolean(activeEditingPost)}
        onClose={() => setActiveEditingPost(null)}
        post={activeEditingPost}
        onPostUpdated={handlePostUpdated}
      />

      {/* Sticky Bottom Confirmation & Scheduling Bar */}
      <footer className="fixed bottom-0 right-0 left-0 lg:left-64 bg-surface/95 backdrop-blur-md border-t border-border-warm py-4 px-6 sm:px-8 z-30 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Publishing Schedule Info */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-soft border border-brand/15 flex items-center justify-center text-brand shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="text-xs">
              <p className="font-semibold text-ink">Publishing Schedule</p>
              <p className="text-ink-muted">
                Posts will go out daily around{' '}
                <span className="font-bold text-ink">{user?.defaultPostTime || '09:00'}</span>{' '}
                ({user?.timezone || 'America/New_York'}) starting tomorrow.{' '}
                <Link to="/settings" className="text-brand font-medium hover:underline ml-1">
                  Change time
                </Link>
              </p>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {!isLinkedInConnected ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-600 font-medium hidden md:inline">
                  LinkedIn connection required
                </span>
                <Link
                  to="/settings"
                  className="px-5 py-2.5 rounded-xl bg-coral hover:bg-coral-hover text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <LinkedInIcon className="w-4 h-4 fill-current" />
                  <span>Connect LinkedIn to Schedule</span>
                </Link>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConfirmSchedule}
                disabled={isConfirming}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-coral hover:bg-coral-hover text-white text-sm font-bold shadow-md hover:shadow-lg transition-all duration-150 flex items-center justify-center gap-2.5 group cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <span>Confirm &amp; Schedule Week ({posts.length} Posts)</span>
                <Check className="w-4 h-4 stroke-[2.5] transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Cancel Draft Confirmation Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel and Delete Batch?"
        description="This will permanently delete this draft batch and its generated posts. Any credits spent generating posts are not refunded."
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>This action cannot be undone.</span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowCancelModal(false)}
              disabled={isCancelling}
              className="px-4 py-2 rounded-lg border border-border-warm bg-white hover:bg-surface text-xs font-semibold text-ink transition-colors cursor-pointer"
            >
              Keep Draft
            </button>
            <button
              type="button"
              onClick={handleCancelBatch}
              disabled={isCancelling}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isCancelling ? 'Cancelling...' : 'Yes, Cancel Batch'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
