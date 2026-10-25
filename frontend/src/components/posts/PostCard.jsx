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
  onUpdateDate,
  isBusy = false,
  busyActionText = 'Updating post...',
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [expandedCaption, setExpandedCaption] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);
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

  // Format date for datetime-local input
  const formatForDateTimeInput = (dateVal) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const setPresetOffsetDays = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(9, 0, 0, 0);
    setRescheduleDate(formatForDateTimeInput(d));
  };

  const handleSaveReschedule = async () => {
    if (!rescheduleDate) return;
    setIsRescheduling(true);
    try {
      const isoString = new Date(rescheduleDate).toISOString();
      if (onUpdateDate) {
        await onUpdateDate(post._id, isoString);
      }
      setShowDateModal(false);
    } catch {
      // Handled by caller toast
    } finally {
      setIsRescheduling(false);
    }
  };

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
      <div className="p-6 rounded-2xl border-2 border-dashed border-border-warm bg-surface/60 h-full flex flex-col items-center justify-center text-center gap-3 min-h-[360px]">
        <div className="w-12 h-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-bold text-brand uppercase tracking-wider">
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
    <article className="relative bg-surface-card rounded-2xl border border-border-warm overflow-hidden h-full flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow duration-200 group">
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

      <div className="flex-1 flex flex-col">
        {/* Top Day Header & Status */}
        <div className="px-4 py-3 bg-surface border-b border-border-warm flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-brand px-2.5 py-0.5 rounded-full bg-brand-soft border border-brand/15 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              {cardDate}
            </span>
            {mode === 'scheduled' && (
              <div className="flex items-center gap-1.5 text-xs text-ink-muted font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setRescheduleDate(formatForDateTimeInput(post.scheduledTime || new Date()));
                    setShowDateModal(true);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-slate-100 hover:text-brand transition-colors cursor-pointer group/date"
                  title="Click to reschedule date and time"
                >
                  <Clock className="w-3.5 h-3.5 text-ink-subtle group-hover/date:text-brand" />
                  <span>{formatScheduledTime(post.scheduledTime)}</span>
                  <Edit3 className="w-3 h-3 text-ink-subtle opacity-0 group-hover/date:opacity-100 transition-opacity ml-0.5" />
                </button>
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

        {/* Media Preview Container / Image Upload & Generate Area (Hidden for text-only scheduled posts to prevent empty gap and horizontal dividing line) */}
        {(hasImage || mode === 'review') && (
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
            ) : null}
          </div>
        )}

        {/* Post Content Area */}
        <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
          <div className="space-y-3">
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
          </div>

          <div className="space-y-2 mt-auto">
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

            {/* Failed Post Alert & Actions in Scheduled Mode */}
            {mode === 'scheduled' && isFailed && (
              <div className="p-3.5 rounded-xl bg-rose-50/90 border border-rose-200 text-rose-800 text-xs space-y-2.5 mt-2">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-rose-700">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Publication Failed</span>
                  </div>
                  {post.creditRefunded && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100/90 border border-emerald-300 text-[10px] font-bold text-emerald-800">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      1 Token Reverted
                    </span>
                  )}
                </div>

                {post.failureReason && (
                  <p className="text-[11px] text-rose-700/90 leading-snug font-medium">
                    {post.failureReason === 'token_expired'
                      ? 'LinkedIn token is expired or disconnected. Reconnect in Settings or reschedule this post.'
                      : post.failureReason}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    className="w-full text-xs py-2 px-3 bg-white hover:bg-slate-50 border border-rose-200 text-rose-700 hover:text-rose-900 font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    onClick={() => {
                      setRescheduleDate(formatForDateTimeInput(post.scheduledTime || new Date()));
                      setShowDateModal(true);
                    }}
                  >
                    <Calendar className="w-3.5 h-3.5 text-rose-600" />
                    <span>Change Date</span>
                  </button>

                  <button
                    type="button"
                    className="w-full text-xs py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    onClick={() => onRetryPostNow && onRetryPostNow(post._id)}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Retry Publishing</span>
                  </button>
                </div>
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
      </div>

      {/* Review Action Toolbar — Edit + Regenerate only (Upload moved to image area) */}
      {mode === 'review' && (
        <div className="p-3.5 bg-surface border-t border-border-warm flex items-center gap-2 shrink-0 mt-auto">
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
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-brand hover:bg-brand-soft transition-colors text-left cursor-pointer font-bold"
                >
                  <span>Regen Whole Post</span>
                  <span className="text-[10px] text-brand">1 credit</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reschedule Date Modal */}
      {showDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl border border-border-warm shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-light">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-brand-soft text-brand">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ink">Change Post Schedule</h3>
                  <p className="text-xs text-ink-muted">Day {dayIndex} of Batch</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDateModal(false)}
                className="p-1.5 rounded-lg text-ink-subtle hover:text-ink hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-ink">
                Select New Publishing Date & Time
              </label>

              {/* Quick Presets */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setPresetOffsetDays(1)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-surface border border-border-warm hover:border-brand/40 hover:text-brand transition-colors cursor-pointer"
                >
                  Tomorrow (9 AM)
                </button>
                <button
                  type="button"
                  onClick={() => setPresetOffsetDays(2)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-surface border border-border-warm hover:border-brand/40 hover:text-brand transition-colors cursor-pointer"
                >
                  In 2 Days
                </button>
                <button
                  type="button"
                  onClick={() => setPresetOffsetDays(3)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-surface border border-border-warm hover:border-brand/40 hover:text-brand transition-colors cursor-pointer"
                >
                  In 3 Days
                </button>
                <button
                  type="button"
                  onClick={() => setPresetOffsetDays(7)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-surface border border-border-warm hover:border-brand/40 hover:text-brand transition-colors cursor-pointer"
                >
                  Next Week
                </button>
              </div>

              <input
                type="datetime-local"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                min={formatForDateTimeInput(new Date())}
                className="w-full bg-white border border-border-warm rounded-xl px-3.5 py-2.5 text-sm font-medium text-ink focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all"
              />

              <p className="text-[11px] text-ink-subtle leading-relaxed">
                {isFailed
                  ? 'Saving this new schedule will revert the post status back to Pending, ready for publishing.'
                  : 'The background scheduler will automatically publish to LinkedIn at this time.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border-light">
              <button
                type="button"
                onClick={() => setShowDateModal(false)}
                disabled={isRescheduling}
                className="px-4 py-2 rounded-xl border border-border-warm text-xs font-semibold text-ink-muted hover:text-ink hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReschedule}
                disabled={isRescheduling || !rescheduleDate}
                className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isRescheduling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Update Schedule</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
};
