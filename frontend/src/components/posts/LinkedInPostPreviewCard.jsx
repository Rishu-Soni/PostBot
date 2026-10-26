import React, { useState, useRef, useEffect } from 'react';
import {
  Edit3,
  Sparkles,
  Upload,
  UploadCloud,
  X,
  ChevronDown,
  Loader2,
  Calendar,
  Clock,
  RotateCw,
  AlertCircle,
  MoreHorizontal,
  Globe,
  ThumbsUp,
  MessageSquare,
  Repeat2,
  Send,
  Image as ImageIcon,
} from 'lucide-react';

export const LinkedInPostPreviewCard = ({
  post,
  dayIndex,
  isMissing = false,
  onRetryMissing,
  onEdit,
  onRegenerate,
  onUploadImage,
  onGenerateImage,
  onRemoveImage,
  isBusy = false,
  busyActionText = 'Updating post...',
  user,
  globalHookPreview = false, // true: collapse all to 3-line hook; false: expand all
  previewWidth = 'desktop', // 'desktop' | 'mobile'
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [localExpanded, setLocalExpanded] = useState(!globalHookPreview);
  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  // Sync with global hook preview toggle when it changes
  useEffect(() => {
    setLocalExpanded(!globalHookPreview);
  }, [globalHookPreview]);

  // Close dropdown on click outside
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

  // Handle image upload file selection
  const handleFileSelected = (file) => {
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) return;
    if (file.size > 5 * 1024 * 1024) return;
    if (onUploadImage) onUploadImage(post, file);
  };

  // Format date and time for post header badge
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

  const formatCardTime = (timeStr) => {
    if (!timeStr) return user?.defaultPostTime || '18:45';
    try {
      const date = new Date(timeStr);
      return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    } catch {
      return user?.defaultPostTime || '18:45';
    }
  };

  // Missing day placeholder state
  if (isMissing) {
    return (
      <div className="w-full flex flex-col">
        <div className="p-6 rounded-2xl border-2 border-dashed border-border-warm bg-surface/60 h-full flex flex-col items-center justify-center text-center gap-3 min-h-[420px]">
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
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-warm bg-white hover:bg-surface text-xs font-semibold text-ink transition-colors cursor-pointer shadow-xs"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Generate Day {dayIndex}</span>
          </button>
        </div>
      </div>
    );
  }

  const cardDate = formatCardDate(post?.scheduledTime);
  const cardTime = formatCardTime(post?.scheduledTime);
  const hasImage = Boolean(post?.image?.url);
  const imageSource = post?.image?.source;
  const imageSourceLabel =
    imageSource === 'stock'
      ? 'Stock Photo'
      : imageSource === 'ai_generated'
      ? 'AI Generated'
      : imageSource === 'user_upload'
      ? 'Your Upload'
      : null;

  // Split caption for the 3-line hook cutoff
  const caption = post?.caption || '';
  const lines = caption.split('\n');
  const isMultiLine = lines.length > 3 || caption.length > 210;

  // Slice first 3 lines for hook cutoff
  const hookLines = lines.slice(0, 3).join('\n');
  const remainingLines = lines.slice(3).join('\n');

  const authorName = user?.name || 'Rishu Soni';
  const authorHeadline =
    user?.headline ||
    user?.profile?.headline ||
    'Founder & Builder | Automating B2B Workflows';
  const authorInitial = authorName.charAt(0).toUpperCase();

  return (
    <div
      className={`w-full transition-all duration-200 ${
        previewWidth === 'mobile' ? 'max-w-[375px] mx-auto' : 'max-w-[555px] mx-auto'
      }`}
    >
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

      {/* =========================================================================
          1. Top PostBot Control Strip (Outside / Above the white LinkedIn Card)
         ========================================================================= */}
      <div className="flex items-center justify-between pb-2.5 px-1 text-xs">
        {/* Left: Date & Day Badge */}
        <div className="flex items-center gap-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 shadow-2xs font-semibold text-slate-800">
            <Calendar className="w-3.5 h-3.5 text-[#0a66c2]" />
            <span>{cardDate}</span>
            <span className="text-slate-300">•</span>
            <Clock className="w-3 h-3 text-slate-400" />
            <span className="text-slate-600 font-mono font-medium">{cardTime}</span>
          </div>
        </div>

        {/* Right: Quick Action Controls (Edit & Regenerate) */}
        <div className="flex items-center gap-1.5">
          {/* Edit Button */}
          <button
            type="button"
            onClick={() => onEdit && onEdit(post)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs font-semibold text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
            title="Edit caption, hashtags, and image"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#0a66c2]" />
            <span>Edit</span>
          </button>

          {/* Regenerate Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs font-semibold text-brand hover:text-brand-hover transition-colors cursor-pointer"
              title="Regenerate with AI (1 credit)"
            >
              <Sparkles className="w-3.5 h-3.5 fill-brand text-brand" />
              <span>Regenerate</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-30 animate-fade-in text-xs">
                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  AI Options (1 credit each)
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onRegenerate && onRegenerate(post._id, 'caption');
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-blue-50 hover:text-[#0a66c2] transition-colors text-left cursor-pointer font-medium"
                >
                  <span>Regen Caption</span>
                  <span className="text-[10px] text-slate-400">1 credit</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onRegenerate && onRegenerate(post._id, 'hashtags');
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-blue-50 hover:text-[#0a66c2] transition-colors text-left cursor-pointer font-medium"
                >
                  <span>Regen Hashtags</span>
                  <span className="text-[10px] text-slate-400">1 credit</span>
                </button>
                <hr className="border-slate-100 my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onRegenerate && onRegenerate(post._id, 'whole');
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[#0a66c2] hover:bg-blue-50 transition-colors text-left cursor-pointer font-bold"
                >
                  <span>Regen Whole Post</span>
                  <span className="text-[10px] text-[#0a66c2]">1 credit</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          2. Authentic White LinkedIn Preview Card Container
         ========================================================================= */}
      <article className="relative bg-white rounded-lg border border-[#e0dfdc] shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col transition-all">
        {/* Isolated Busy Loading Overlay */}
        {isBusy && (
          <div className="absolute inset-0 z-20 bg-white/92 backdrop-blur-xs flex flex-col items-center justify-center gap-2 p-4 text-center animate-fade-in">
            <Loader2 className="w-8 h-8 text-[#0a66c2] animate-spin" />
            <span className="text-xs font-semibold text-slate-800">{busyActionText}</span>
          </div>
        )}

        {/* -----------------------------------------------------------------------
            A. LinkedIn Author Header
           ----------------------------------------------------------------------- */}
        <div className="p-3 sm:p-4 pb-2 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {/* User Avatar */}
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={authorName}
                className="w-12 h-12 rounded-full object-cover shrink-0 border border-slate-100"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#0a66c2] flex items-center justify-center text-white font-bold text-base shrink-0 select-none shadow-xs">
                {authorInitial}
              </div>
            )}

            {/* Author Name, Headline, and Timestamp */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                <span className="text-[14px] font-semibold text-[#000000e6] hover:text-[#0a66c2] hover:underline cursor-pointer">
                  {authorName}
                </span>
                <span className="text-[12px] text-[#00000099] font-normal">• 1st</span>
              </div>
              <p className="text-[12px] text-[#00000099] leading-tight truncate mt-0.5" title={authorHeadline}>
                {authorHeadline}
              </p>
              <div className="flex items-center gap-1 text-[12px] text-[#00000099] leading-tight mt-0.5">
                <span>1h</span>
                <span>•</span>
                <Globe className="w-3 h-3 text-[#00000099]" />
              </div>
            </div>
          </div>

          {/* Three Dots Icon */}
          <button
            type="button"
            className="p-1 rounded-full text-[#00000099] hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            aria-label="More options"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>

        {/* -----------------------------------------------------------------------
            B. Caption Body & 3-Line Hook Cutoff ("See more" fold)
           ----------------------------------------------------------------------- */}
        <div className="px-3 sm:px-4 py-1 text-[14px] leading-[20px] text-[#000000e6] font-normal whitespace-pre-line break-words">
          {!localExpanded && isMultiLine ? (
            /* Clamped Hook View (First 3 Lines + authentic "...more") */
            <div>
              <span>{hookLines}</span>
              <button
                type="button"
                onClick={() => setLocalExpanded(true)}
                className="inline-block text-[14px] font-semibold text-[#00000099] hover:text-[#0a66c2] hover:underline cursor-pointer ml-1"
              >
                ...more
              </button>
            </div>
          ) : (
            /* Expanded Full Post View with fold indicator */
            <div>
              <span>{isMultiLine ? hookLines : caption}</span>

              {isMultiLine && (
                <>
                  {/* Subtle LinkedIn "see more" Fold Indicator */}
                  <div className="my-2 py-1 px-3 bg-slate-50 border-y border-dashed border-slate-200 rounded text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none flex items-center justify-center gap-2">
                    <span className="text-slate-300">---</span>
                    <span>✂️ LinkedIn "see more" fold</span>
                    <span className="text-slate-300">---</span>
                  </div>

                  {/* Remaining Caption */}
                  {remainingLines && <span>{remainingLines}</span>}

                  {/* Collapse back option */}
                  <div className="pt-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => setLocalExpanded(false)}
                      className="text-[12px] font-medium text-[#0a66c2] hover:underline cursor-pointer"
                    >
                      Show less (Preview hook)
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------------------
              C. Inline LinkedIn Hashtags (No gray pill borders)
             --------------------------------------------------------------------- */}
          {Array.isArray(post?.hashtags) && post.hashtags.length > 0 && (
            <div className="pt-2 flex flex-wrap gap-x-1.5 gap-y-1">
              {post.hashtags.map((tag, i) => (
                <span
                  key={i}
                  className="text-[14px] font-semibold text-[#0a66c2] hover:underline cursor-pointer inline-block"
                >
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* -----------------------------------------------------------------------
            D. Media Slot (Moved BELOW Text & Hashtags)
           ----------------------------------------------------------------------- */}
        <div className="mt-2">
          {hasImage ? (
            /* Attached Image (Edge-to-Edge Feed Display) */
            <div className="relative group/media overflow-hidden bg-slate-100 border-y border-[#e0dfdc]">
              <img
                src={post.image.url}
                alt={`${cardDate} graphic`}
                className="w-full max-h-[460px] object-cover object-center group-hover:scale-[1.01] transition-transform duration-300"
                loading="lazy"
              />

              {/* Source Badge */}
              {imageSourceLabel && (
                <div className="absolute top-2.5 left-2.5 z-10">
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded shadow-sm flex items-center gap-1 ${
                      imageSource === 'ai_generated'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white/95 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {imageSource === 'ai_generated' && (
                      <Sparkles className="w-2.5 h-2.5 fill-white text-white" />
                    )}
                    <span>{imageSourceLabel}</span>
                  </span>
                </div>
              )}

              {/* Hover Actions (Replace / Remove) */}
              <div className="absolute inset-0 bg-black/0 group-hover/media:bg-black/40 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover/media:opacity-100">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-1.5 bg-white/95 hover:bg-white rounded-lg text-xs font-semibold text-slate-800 flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Replace Image</span>
                </button>
                {onRemoveImage && (
                  <button
                    type="button"
                    onClick={() => onRemoveImage(post)}
                    className="px-3.5 py-1.5 bg-white/95 hover:bg-white rounded-lg text-xs font-semibold text-rose-600 flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Text-only Media Bar Dropzone */
            <div className="px-3 sm:px-4 py-2">
              <div
                className={`p-3 rounded-lg border-2 border-dashed transition-all flex flex-col sm:flex-row items-center justify-between gap-2.5 text-center sm:text-left ${
                  dragOver
                    ? 'border-[#0a66c2] bg-blue-50/70'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
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
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-[11px] font-semibold text-slate-700 truncate">
                      Text-only post by default
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      Drop an image here or attach below
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-md border border-slate-200 text-[11px] font-semibold text-slate-700 flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
                    <span>Upload Image</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onGenerateImage && onGenerateImage(post)}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 text-[11px] font-semibold text-[#0a66c2] flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 fill-[#0a66c2]" />
                    <span>Generate AI Visual</span>
                    <span className="text-[9px] opacity-75">(1 cr)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* -----------------------------------------------------------------------
            E. Authentic LinkedIn Social & Action Footer
           ----------------------------------------------------------------------- */}
        <div className="mt-2">
          {/* Social Stats / Reactions Bar */}
          <div className="border-t border-slate-100 px-3 sm:px-4 py-2 flex items-center justify-between text-[12px] text-[#00000099] select-none">
            <div className="flex items-center gap-1">
              <div className="flex items-center -space-x-1">
                <span className="w-4 h-4 rounded-full bg-[#0a66c2] flex items-center justify-center text-[9px] text-white">
                  👍
                </span>
                <span className="w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center text-[9px] text-white">
                  ❤️
                </span>
                <span className="w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center text-[9px] text-white">
                  💡
                </span>
              </div>
              <span className="font-normal hover:text-[#0a66c2] hover:underline cursor-pointer ml-1">
                24
              </span>
            </div>

            <div className="flex items-center gap-1 text-[12px] text-[#00000099]">
              <span className="hover:text-[#0a66c2] hover:underline cursor-pointer">
                6 comments
              </span>
              <span>•</span>
              <span className="hover:text-[#0a66c2] hover:underline cursor-pointer">
                2 reposts
              </span>
            </div>
          </div>

          {/* Action Buttons Bar */}
          <div className="border-t border-[#e0dfdc] px-1 py-1 flex items-center justify-around text-[#00000099] text-[13px] font-semibold select-none">
            <button
              type="button"
              className="flex-1 py-2 px-2 hover:bg-slate-100 rounded-md flex items-center justify-center gap-1.5 transition-colors text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ThumbsUp className="w-4 h-4 stroke-[1.8]" />
              <span className="hidden xs:inline">Like</span>
            </button>
            <button
              type="button"
              className="flex-1 py-2 px-2 hover:bg-slate-100 rounded-md flex items-center justify-center gap-1.5 transition-colors text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 stroke-[1.8]" />
              <span className="hidden xs:inline">Comment</span>
            </button>
            <button
              type="button"
              className="flex-1 py-2 px-2 hover:bg-slate-100 rounded-md flex items-center justify-center gap-1.5 transition-colors text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <Repeat2 className="w-4 h-4 stroke-[1.8]" />
              <span className="hidden xs:inline">Repost</span>
            </button>
            <button
              type="button"
              className="flex-1 py-2 px-2 hover:bg-slate-100 rounded-md flex items-center justify-center gap-1.5 transition-colors text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <Send className="w-4 h-4 stroke-[1.8]" />
              <span className="hidden xs:inline">Send</span>
            </button>
          </div>
        </div>
      </article>
    </div>
  );
};
