import React, { useState, useRef, useEffect } from 'react';
import {
  Edit3,
  Sparkles,
  Upload,
  UploadCloud,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  ExternalLink,
  ChevronDown,
  Loader2,
  Calendar,
  ImagePlus,
  X,
} from 'lucide-react';
import { Badge } from '../common/Badge';

export const PostCard = ({
  post,
  dayIndex,
  mode = 'review', // 'review' | 'scheduled'
  isMissing = false,
  onRetryMissing,
  onEdit,
  onRegenerate,
  onUploadImage,
  onGenerateImage,
  onRemoveImage,
  onRetryPostNow,
  isBusy = false,
  busyActionText = 'Updating post...',
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [expandedCaption, setExpandedCaption] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  // Format scheduledTime into a friendly date string like "Fri, Sep 19"
  const formatCardDate = (timeStr) => {
    if (!timeStr) return `Day ${dayIndex}`;
    try {
      const date = new Date(timeStr);
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(date);
    } catch {
      return `Day ${dayIndex}`;
    }
  };

  // Handle file selection from input
  const handleFileSelected = (file) => {
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) return;
    if (file.size > 5 * 1024 * 1024) return;
    if (onUploadImage) onUploadImage(post, file);
  };

  // Partial generation placeholder state
  if (isMissing) {
    return (
      <div className="p-6 rounded-2xl border-2 border-dashed border-border-warm bg-surface/60 flex flex-col items-center justify-center text-center gap-3 min-h-[360px]">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
            Day {dayIndex}
          </span>
          <h4 className="text-sm font-semibold text-ink">Not Generated Yet</h4>
          <p className="text-xs text-ink-muted max-w-xs">
            This day was missed in a previous run or credit interruption.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRetryMissing && onRetryMissing(dayIndex)}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-warm bg-white hover:bg-surface text-xs font-semibold text-ink transition-colors cursor-pointer"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>Generate Day {dayIndex}</span>
        </button>
      </div>
    );
  }

  const hasImage = post?.image?.url;
  const imageSource = post?.image?.source;
  const imageSourceLabel =
    imageSource === 'stock'
      ? 'Stock Photo'
      : imageSource === 'ai_generated'
      ? 'AI Generated'
      : imageSource === 'user_upload'
      ? 'Your Upload'
      : null;

  const formatScheduledTime = (timeStr) => {
    if (!timeStr) return 'Pending Schedule';
    try {
      const date = new Date(timeStr);
      return new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
    } catch {
      return timeStr;
    }
  };

  const isPosted = post?.status === 'posted';
  const isFailed = post?.status === 'failed';
  const isPending = post?.status === 'pending';

  const cardDate = formatCardDate(post?.scheduledTime);

  return (
    <article className="relative bg-surface-card rounded-2xl border border-border-warm overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow duration-200 group">
      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelected(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />

      {/* Isolated Loading Overlay */}
      {isBusy && (
        <div className="absolute inset-0 z-20 bg-surface-card/90 backdrop-blur-xs flex flex-col items-center justify-center gap-2 p-4 text-center animate-fade-in">
          <Loader2 className="w-7 h-7 text-brand animate-spin" />
          <span className="text-xs font-semibold text-ink">{busyActionText}</span>
        </div>
      )}

      <div>
        {/* Top Day Header & Status */}
        <div className="px-4 py-3 bg-surface border-b border-border-warm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-brand px-2.5 py-0.5 rounded-full bg-brand-soft border border-brand/15 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              {cardDate}
            </span>
            {mode === 'scheduled' && (
              <div className="flex items-center gap-1.5 text-xs text-ink-muted font-medium">
                <Clock className="w-3.5 h-3.5 text-ink-subtle" />
                <span>{formatScheduledTime(post.scheduledTime)}</span>
              </div>
            )}
          </div>

          {/* Status in scheduled mode */}
          {mode === 'scheduled' && (
            <div>
              {isPosted && (
                <Badge variant="posted" dot size="sm">
                  Posted
                </Badge>
              )}
              {isFailed && (
                <Badge variant="failed" dot size="sm">
                  Failed
                </Badge>
              )}
              {isPending && (
                <Badge variant="pending" size="sm">
                  <Clock className="w-3 h-3 text-ink-muted" />
                  <span>Pending</span>
                </Badge>
              )}
            </div>
          )}

          {/* Source Badge in review mode — only show when image exists */}
          {mode === 'review' && imageSourceLabel && (
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded flex items-center gap-1 ${
                imageSource === 'ai_generated'
                  ? 'bg-brand-soft text-brand-text border border-blue-100'
                  : 'bg-white text-ink-muted border border-border-warm'
              }`}
            >
              {imageSource === 'ai_generated' && <Sparkles className="w-2.5 h-2.5 text-brand fill-brand" />}
              <span>{imageSourceLabel}</span>
            </span>
          )}
        </div>

        {/* Media Preview Container / Image Upload & Generate Area */}
        <div className="relative h-48 w-full bg-surface border-b border-border-warm overflow-hidden">
          {hasImage ? (
            <>
              <img
                src={post.image.url}
                alt={`${cardDate} graphic`}
                className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-300"
                loading="lazy"
              />
              {/* Overlay actions when image exists (review mode only) */}
              {mode === 'review' && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-white/95 hover:bg-white rounded-lg text-xs font-semibold text-ink flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Replace</span>
                  </button>
                  {onRemoveImage && (
                    <button
                      type="button"
                      onClick={() => onRemoveImage(post)}
                      className="px-3 py-1.5 bg-white/95 hover:bg-white rounded-lg text-xs font-semibold text-rose-600 flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              )}
            </>
          ) : mode === 'review' ? (
            /* Empty state — Upload or Generate options */
            <div
              className={`w-full h-full flex flex-col items-center justify-center gap-3 transition-colors ${
                dragOver ? 'bg-brand-soft/60' : 'bg-surface'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileSelected(e.dataTransfer.files[0]);
                }
              }}
            >
              <div className="flex items-center gap-4">
                {/* Upload Image Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border-2 border-dashed border-border-warm hover:border-brand/50 bg-white hover:bg-brand-soft/30 transition-all cursor-pointer group/upload"
                >
                  <UploadCloud className="w-5 h-5 text-ink-muted group-hover/upload:text-brand transition-colors" />
                  <span className="text-[11px] font-semibold text-ink-muted group-hover/upload:text-brand transition-colors">
                    Upload Image
                  </span>
                  <span className="text-[9px] text-ink-subtle">Free</span>
                </button>

                {/* Divider */}
                <div className="flex flex-col items-center gap-1">
                  <div className="w-px h-4 bg-border-warm"></div>
                  <span className="text-[10px] text-ink-subtle font-medium">or</span>
                  <div className="w-px h-4 bg-border-warm"></div>
                </div>

                {/* Generate with AI Button */}
                <button
                  type="button"
                  onClick={() => onGenerateImage && onGenerateImage(post)}
                  className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border-2 border-dashed border-brand/20 hover:border-brand/50 bg-brand-soft/20 hover:bg-brand-soft/50 transition-all cursor-pointer group/ai"
                >
                  <Sparkles className="w-5 h-5 text-brand/60 group-hover/ai:text-brand fill-brand/30 group-hover/ai:fill-brand/60 transition-colors" />
                  <span className="text-[11px] font-semibold text-brand/70 group-hover/ai:text-brand transition-colors">
                    Generate with AI
                  </span>
                  <span className="text-[9px] text-brand/50">1 credit</span>
                </button>
              </div>

              <p className="text-[10px] text-ink-subtle mt-1">
                Drag & drop an image here, or skip for a text-only post
              </p>
            </div>
          ) : (
            /* Scheduled mode with no image — simple placeholder */
            <div className="w-full h-full flex flex-col items-center justify-center text-ink-subtle text-xs">
              <span>Text-only post</span>
            </div>
          )}
        </div>

        {/* Post Content Area */}
        <div className="p-5 space-y-3">
          <p
            className={`text-xs sm:text-sm text-ink font-normal leading-relaxed whitespace-pre-line ${
              !expandedCaption ? 'line-clamp-4' : ''
            }`}
          >
            {post?.caption || 'No caption generated.'}
          </p>

          {post?.caption && post.caption.length > 160 && (
            <button
              type="button"
              onClick={() => setExpandedCaption((prev) => !prev)}
              className="text-xs font-semibold text-brand hover:text-brand-hover flex items-center gap-1 cursor-pointer"
            >
              <span>{expandedCaption ? 'Show less' : 'Show full copy'}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${expandedCaption ? 'rotate-180' : ''}`}
              />
            </button>
          )}

          {/* Hashtag Chips */}
          {Array.isArray(post?.hashtags) && post.hashtags.length > 0 && (
            <div className="pt-2 flex flex-wrap gap-1.5">
              {post.hashtags.map((tag, i) => (
                <span
                  key={i}
                  className="text-[11px] font-medium text-ink-muted bg-surface border border-border-warm px-2 py-0.5 rounded-md"
                >
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </span>
              ))}
            </div>
          )}

          {/* Failed Post Alert & Retry in Scheduled Mode */}
          {mode === 'scheduled' && isFailed && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2 mt-2">
              <div className="flex items-start gap-1.5 font-semibold">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>Publication Failed</span>
              </div>
              {post.failureReason && (
                <p className="text-[11px] text-rose-700 leading-snug">
                  {post.failureReason}
                </p>
              )}
              <button
                type="button"
                className="w-full text-xs py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                onClick={() => onRetryPostNow && onRetryPostNow(post._id)}
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Retry Publishing Now</span>
              </button>
            </div>
          )}

          {/* Posted link in Scheduled Mode */}
          {mode === 'scheduled' && isPosted && post?.linkedinPostId && (
            <div className="pt-2 border-t border-border-light flex items-center justify-between text-xs text-emerald-600 font-medium">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Published to LinkedIn</span>
              </span>
              <a
                href="https://www.linkedin.com/feed/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline font-semibold"
              >
                <span>View</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Review Action Toolbar — Edit + Regenerate only (Upload moved to image area) */}
      {mode === 'review' && (
        <div className="p-3.5 bg-surface border-t border-border-warm flex items-center gap-2">
          {/* Free Edit Button */}
          <button
            type="button"
            onClick={() => onEdit && onEdit(post)}
            className="flex-1 py-1.5 px-2 bg-surface-card hover:bg-surface border border-border-warm rounded-lg text-xs font-semibold text-ink flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Edit3 className="w-3.5 h-3.5 text-brand" />
            <span>Edit</span>
          </button>

          {/* Regenerate Dropdown — caption, hashtags, or whole post (no image option) */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="py-1.5 px-2.5 bg-surface-card hover:bg-surface border border-border-warm rounded-lg text-xs font-semibold text-brand flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 fill-brand text-brand" />
              <span className="hidden xl:inline">Regenerate</span>
              <ChevronDown className="w-3 h-3 text-ink-muted" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-52 bg-white border border-border-warm rounded-xl shadow-lg p-1.5 z-30 animate-fade-in text-xs">
                <div className="px-2 py-1 text-[10px] font-bold text-ink-muted uppercase tracking-wider">
                  AI Options (1 credit each)
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onRegenerate && onRegenerate(post._id, 'caption');
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-ink hover:bg-brand-soft hover:text-brand transition-colors text-left cursor-pointer font-medium"
                >
                  <span>Regen Caption</span>
                  <span className="text-[10px] text-ink-muted">1 credit</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onRegenerate && onRegenerate(post._id, 'hashtags');
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-ink hover:bg-brand-soft hover:text-brand transition-colors text-left cursor-pointer font-medium"
                >
                  <span>Regen Hashtags</span>
                  <span className="text-[10px] text-ink-muted">1 credit</span>
                </button>

                <hr className="border-border-light my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onRegenerate && onRegenerate(post._id, 'whole');
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-coral hover:bg-coral-soft transition-colors text-left cursor-pointer font-bold"
                >
                  <span>Regen Whole Post</span>
                  <span className="text-[10px] text-coral">1 credit</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
};
