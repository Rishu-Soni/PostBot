import React, { useState, useRef, useEffect } from 'react';
import {
  Edit3,
  Sparkles,
  Upload,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  ExternalLink,
  ChevronDown,
  Loader2,
  Calendar,
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
  onRetryPostNow,
  isBusy = false,
  busyActionText = 'Updating post...',
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [expandedCaption, setExpandedCaption] = useState(false);
  const dropdownRef = useRef(null);

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

  const imageSource = post?.image?.source;
  const imageSourceLabel =
    imageSource === 'stock'
      ? 'Stock Photo'
      : imageSource === 'ai'
      ? 'AI Generated'
      : imageSource === 'user_upload'
      ? 'Your Upload'
      : 'Visual';

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

  return (
    <article className="relative bg-surface-card rounded-2xl border border-border-warm overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow duration-200 group">
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
            <span className="text-xs font-bold text-brand px-2.5 py-0.5 rounded-full bg-brand-soft border border-brand/15">
              Day {post.dayIndex}
            </span>
            {mode === 'scheduled' && (
              <div className="flex items-center gap-1.5 text-xs text-ink-muted font-medium">
                <Calendar className="w-3.5 h-3.5 text-ink-subtle" />
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

          {/* Source Badge in review mode */}
          {mode === 'review' && (
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded flex items-center gap-1 ${
                imageSource === 'ai'
                  ? 'bg-brand-soft text-brand-text border border-blue-100'
                  : 'bg-white text-ink-muted border border-border-warm'
              }`}
            >
              {imageSource === 'ai' && <Sparkles className="w-2.5 h-2.5 text-brand fill-brand" />}
              <span>{imageSourceLabel}</span>
            </span>
          )}
        </div>

        {/* Media Preview Container */}
        <div className="relative h-48 w-full bg-surface border-b border-border-warm overflow-hidden">
          {post?.image?.url ? (
            <img
              src={post.image.url}
              alt={`Day ${post.dayIndex} graphic`}
              className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-ink-subtle text-xs">
              <span>No visual attached</span>
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

      {/* Review Action Toolbar */}
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

          {/* Quick Upload Image */}
          <button
            type="button"
            onClick={() => onUploadImage && onUploadImage(post)}
            title="Upload your own visual (Free)"
            className="flex-1 py-1.5 px-2 bg-surface-card hover:bg-surface border border-border-warm rounded-lg text-xs font-semibold text-ink-muted hover:text-ink flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Upload className="w-3.5 h-3.5 text-ink-muted" />
            <span>Upload</span>
          </button>

          {/* Regenerate Dropdown */}
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

                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onRegenerate && onRegenerate(post._id, 'image');
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-ink hover:bg-brand-soft hover:text-brand transition-colors text-left cursor-pointer font-medium"
                >
                  <span>Regen Image</span>
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
