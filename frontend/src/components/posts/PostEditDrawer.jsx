import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Save,
  RotateCw,
  Upload,
  Hash,
  Image as ImageIcon,
  Check,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { ImageUploader } from './ImageUploader';
import { postService } from '../../services/postService';
import { useCredits } from '../../context/CreditsContext';
import { useToast } from '../../context/ToastContext';

export const PostEditDrawer = ({
  isOpen,
  onClose,
  post,
  onPostUpdated,
}) => {
  const { creditBalance, refreshBalance } = useCredits();
  const { showToast } = useToast();

  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [isSavingText, setIsSavingText] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regeneratingPart, setRegeneratingPart] = useState(null);
  const [showUploader, setShowUploader] = useState(false);

  useEffect(() => {
    if (post) {
      setCaption(post.caption || '');
      setHashtags(Array.isArray(post.hashtags) ? [...post.hashtags] : []);
      setShowUploader(false);
    }
  }, [post]);

  if (!isOpen || !post) return null;

  const handleAddTag = () => {
    const cleanTag = tagInput.trim().replace(/^#/, '');
    if (!cleanTag) return;
    const formatted = `#${cleanTag}`;
    if (!hashtags.includes(formatted)) {
      setHashtags([...hashtags, formatted]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (indexToRemove) => {
    setHashtags(hashtags.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSaveText = async () => {
    setIsSavingText(true);
    try {
      const updated = await postService.updatePost(post._id, {
        caption,
        hashtags,
      });
      showToast('Post copy updated successfully! (Free edit)', 'success');
      if (onPostUpdated) onPostUpdated(updated);
    } catch (err) {
      showToast(err.message || 'Failed to save changes.', 'error');
    } finally {
      setIsSavingText(false);
    }
  };

  const handleRegenerate = async (part) => {
    if (creditBalance < 1) {
      showToast('Insufficient credits. You need at least 1 credit to regenerate.', 'error');
      return;
    }

    setIsRegenerating(true);
    setRegeneratingPart(part);
    try {
      const updated = await postService.regeneratePost(post._id, part);
      showToast(`Regenerated ${part} successfully! (1 credit spent)`, 'success');
      refreshBalance();
      if (onPostUpdated) onPostUpdated(updated);
    } catch (err) {
      showToast(err.message || `Failed to regenerate ${part}.`, 'error');
    } finally {
      setIsRegenerating(false);
      setRegeneratingPart(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* ModalBackdrop */}
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-[2px] transition-opacity z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* EditDrawerContainer */}
      <aside
        aria-label="Edit and Regenerate Post Slide-over"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-[500px] bg-white shadow-2xl flex flex-col border-l border-border-warm animate-slide-in-right"
      >
        {/* DrawerHeader */}
        <header className="px-6 py-4 border-b border-border-warm bg-surface flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand text-white shadow-xs tracking-wide">
              Day {post.dayIndex}
            </span>
            <h2 className="text-base font-bold text-ink tracking-tight">
              Edit &amp; Regenerate Post
            </h2>
          </div>
          {/* Close Drawer Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        </header>

        {/* DrawerScrollableBody */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* SECTION 1: Caption Copy */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="post-caption" className="text-xs font-bold tracking-wider text-ink uppercase flex items-center gap-1.5">
                <span>Caption Copy</span>
                <span className="text-[10px] lowercase text-ink-muted font-medium px-1.5 py-0.5 bg-surface rounded border border-border-warm">
                  (free manual edits)
                </span>
              </label>
              <span className="text-[11px] font-semibold text-ink-muted tracking-tight bg-surface px-2 py-0.5 rounded border border-border-warm">
                {caption.length} characters / 3,000 max
              </span>
            </div>

            <div className="relative">
              <textarea
                id="post-caption"
                rows={5}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write your contrarian post or company insight..."
                className="w-full rounded-xl border border-border-warm text-ink text-sm leading-relaxed p-3.5 focus:border-brand focus:ring-2 focus:ring-brand/20 bg-surface/40 placeholder:text-ink-subtle resize-none transition-shadow font-normal"
              />
            </div>

            {/* Quick Action: Save Text Changes */}
            <div className="flex justify-end pt-0.5">
              <button
                type="button"
                onClick={handleSaveText}
                disabled={isSavingText}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-warm bg-white hover:bg-surface text-xs font-semibold text-ink transition shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isSavingText ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                ) : (
                  <Save className="w-3.5 h-3.5 text-brand" />
                )}
                <span>Save Text Changes</span>
              </button>
            </div>
          </section>

          {/* SECTION 2: Hashtags Section */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold tracking-wider text-ink uppercase">
                # Hashtags
              </label>
              <span className="text-[11px] text-ink-muted font-medium">Click tag to remove</span>
            </div>

            {/* Tag Chips Container */}
            <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-surface/60 border border-border-warm min-h-[44px] items-center">
              {hashtags.map((tag, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-brand-soft text-brand border border-brand/20"
                >
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(idx)}
                    aria-label={`Remove hashtag ${tag}`}
                    className="hover:text-red-500 focus:outline-none cursor-pointer"
                  >
                    <X className="w-3 h-3 stroke-[2.5]" />
                  </button>
                </span>
              ))}

              {/* Add Tag Input */}
              <div className="flex items-center gap-1 min-w-[140px] flex-1">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Type tag &amp; press enter..."
                  className="w-full text-xs rounded-lg border-0 py-1.5 px-2 text-ink placeholder:text-ink-subtle bg-transparent focus:ring-0"
                />
              </div>
            </div>
          </section>

          {/* SECTION 3: Post Visual */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold tracking-wider text-ink uppercase flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-ink-muted" />
                <span>Post Visual</span>
              </label>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-brand-soft text-brand border border-blue-100">
                <Sparkles className="w-2.5 h-2.5 fill-brand" />
                <span>{post.image?.source === 'user_upload' ? 'Your Upload' : post.image?.source === 'ai' ? 'AI Generated' : 'Stock Photo'}</span>
              </span>
            </div>

            {/* Visual Preview Card */}
            <div className="relative rounded-xl overflow-hidden border border-border-warm shadow-sm group bg-surface aspect-video max-h-52 w-full">
              {post?.image?.url ? (
                <img
                  src={post.image.url}
                  alt={`Visual for Day ${post.dayIndex}`}
                  className="w-full h-full object-cover object-center"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-ink-subtle">
                  No visual attached
                </div>
              )}
              <div className="absolute bottom-2 left-2.5 px-2 py-1 bg-black/60 backdrop-blur-md rounded text-[11px] text-white font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>High Quality (16:9)</span>
              </div>
            </div>

            {/* Action Row: Image Actions */}
            <div className="grid grid-cols-2 gap-2.5 pt-0.5">
              <button
                type="button"
                onClick={() => handleRegenerate('image')}
                disabled={isRegenerating}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-border-warm bg-white hover:bg-surface text-xs font-semibold text-ink transition shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isRegenerating && regeneratingPart === 'image' ? (
                  <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-brand" />
                )}
                <span>Regen Image <span className="text-ink-muted font-normal">(1c)</span></span>
              </button>

              <button
                type="button"
                onClick={() => setShowUploader((prev) => !prev)}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-border-warm bg-white hover:bg-surface text-xs font-semibold text-ink transition shadow-2xs cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-ink-muted" />
                <span>Upload Own <span className="text-emerald-700 font-normal">(Free)</span></span>
              </button>
            </div>

            {showUploader && (
              <div className="pt-2 animate-fade-in">
                <ImageUploader
                  postId={post._id}
                  onUploadSuccess={(updated) => {
                    if (onPostUpdated) onPostUpdated(updated);
                    setShowUploader(false);
                  }}
                />
              </div>
            )}
          </section>

          {/* SECTION 4: AI Regeneration Options Box */}
          <section className="pt-3 pb-1 border-t border-border-light space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-ink uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 fill-brand text-brand" />
                <span>AI Regeneration Options</span>
              </span>
              <span className="text-[11px] text-brand font-semibold">1 Credit / action</span>
            </div>

            {/* Split micro-regeneration options */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleRegenerate('caption')}
                disabled={isRegenerating}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-border-warm bg-surface/80 hover:bg-white text-xs font-semibold text-ink transition shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isRegenerating && regeneratingPart === 'caption' ? (
                  <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />
                ) : (
                  <RotateCw className="w-3.5 h-3.5 text-brand" />
                )}
                <span>Regen Caption (1c)</span>
              </button>

              <button
                type="button"
                onClick={() => handleRegenerate('hashtags')}
                disabled={isRegenerating}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-border-warm bg-surface/80 hover:bg-white text-xs font-semibold text-ink transition shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isRegenerating && regeneratingPart === 'hashtags' ? (
                  <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />
                ) : (
                  <Hash className="w-3.5 h-3.5 text-brand" />
                )}
                <span>Regen Hashtags (1c)</span>
              </button>
            </div>

            {/* Full Regeneration Box with Warning Note */}
            <div className="p-3.5 rounded-xl bg-surface border border-border-warm space-y-2.5">
              <div className="flex items-start gap-2 text-[11px] text-ink-muted leading-snug font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>Regenerates entire copy, tags, and finds new visual match automatically.</span>
              </div>
              <button
                type="button"
                onClick={() => handleRegenerate('whole')}
                disabled={isRegenerating}
                className="w-full py-2.5 px-4 rounded-lg bg-white border border-border-warm hover:border-brand text-ink hover:text-brand font-bold text-xs flex items-center justify-center gap-2 shadow-2xs transition duration-150 cursor-pointer disabled:opacity-50"
              >
                {isRegenerating && regeneratingPart === 'whole' ? (
                  <Loader2 className="w-4 h-4 text-brand animate-spin" />
                ) : (
                  <RotateCw className="w-4 h-4 text-brand" />
                )}
                <span>Regenerate Whole Post (1 credit)</span>
              </button>
            </div>
          </section>
        </div>

        {/* DrawerStickyFooter */}
        <footer className="p-4 px-6 border-t border-border-warm bg-surface/90 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-coral hover:bg-coral-hover text-white text-xs font-bold shadow-md shadow-coral/20 hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Done / Save Changes</span>
          </button>
        </footer>
      </aside>
    </div>
  );
};
