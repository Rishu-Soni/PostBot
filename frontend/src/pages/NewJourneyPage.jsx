import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import {
  Compass,
  Sparkles,
  Calendar,
  Clock,
  Hash,
  FileText,
  Palette,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Plus,
} from 'lucide-react';

const PLACEHOLDERS = [
  { tag: '{{n}}', label: 'Day Number (n)', desc: 'Current day number (e.g. 1, 2)' },
  { tag: '{{journeyTitle}}', label: 'Journey Title', desc: 'The title of your journey' },
  { tag: '{{topic}}', label: 'Daily Topic', desc: 'Mandatory daily focus / lesson learned' },
  { tag: '{{challenge}}', label: 'Daily Challenge', desc: 'Hurdle or question of the day' },
  { tag: '{{hashtags}}', label: 'Hashtags', desc: 'Formatted hashtags block' },
];

const DEFAULT_SAMPLE_TEMPLATE = `Day {{n}} of #{{journeyTitle}} 🚀

Today's focus: {{topic}}

Key takeaway & challenge:
{{challenge}}

{{hashtags}}`;

export const NewJourneyPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const templateRef = useRef(null);

  const [formData, setFormData] = useState({
    title: '',
    hashtags: '',
    template: '',
    startDate: new Date().toISOString().split('T')[0],
    postTimeLocal: '09:00',
    imageStyle: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  // Insert placeholder tag into textarea at cursor position
  const handleInsertPlaceholder = (tag) => {
    const textarea = templateRef.current;
    if (!textarea) {
      setFormData((prev) => ({ ...prev, template: prev.template + tag }));
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = formData.template;
    const newVal = currentVal.substring(0, start) + tag + currentVal.substring(end);

    setFormData((prev) => ({ ...prev, template: newVal }));

    setTimeout(() => {
      textarea.focus();
      const newPos = start + tag.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleUsePresetTemplate = () => {
    setFormData((prev) => ({ ...prev, template: DEFAULT_SAMPLE_TEMPLATE }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Frontend validation
    if (!formData.title.trim()) {
      setError('Please provide a title for your journey.');
      return;
    }

    if (!formData.template.trim()) {
      setError('Please provide a post template.');
      return;
    }

    if (!formData.template.includes('{{topic}}')) {
      setError('Template must contain at least the {{topic}} placeholder.');
      return;
    }

    // Split comma-separated hashtags into string array
    const hashtagsArray = formData.hashtags
      .split(',')
      .map((h) => h.trim())
      .filter((h) => h.length > 0);

    setSubmitting(true);

    try {
      const response = await fetch('/api/journeys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          hashtags: hashtagsArray,
          template: formData.template.trim(),
          startDate: formData.startDate ? new Date(formData.startDate).toISOString() : undefined,
          postTimeLocal: formData.postTimeLocal || '09:00',
          imageStyle: formData.imageStyle.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create journey. Please check the inputs.');
      }

      // Successful creation, redirect to /journeys/:id
      const newId = data.journey?._id || data.journey?.id;
      if (newId) {
        navigate(`/journeys/${newId}`);
      } else {
        navigate('/journeys');
      }
    } catch (err) {
      console.error('Create journey error:', err);
      setError(err.message || 'An error occurred while creating the journey.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasTopicPlaceholder = formData.template.includes('{{topic}}');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Breadcrumb & Navigation */}
        <div className="mb-6">
          <Link
            to="/journeys"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-indigo-400 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Journeys</span>
          </Link>
        </div>

        {/* Header Section */}
        <div className="relative rounded-2xl bg-gradient-to-r from-blue-900/30 via-indigo-900/20 to-violet-900/30 border border-indigo-500/20 p-6 sm:p-8 mb-8 overflow-hidden">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <Compass className="w-3.5 h-3.5" />
              <span>Journey Builder</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Create a New Posting Journey
            </h1>
            <p className="mt-2 text-slate-300 text-sm sm:text-base max-w-2xl leading-relaxed">
              Define your journey template, schedule, and hashtag strategy. PostBot will automate your daily LinkedIn content cadence.
            </p>
          </div>
          <div className="absolute right-0 top-0 -mt-10 -mr-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-500/30 flex items-start gap-3 text-red-200 text-sm">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
          {/* Main Card: Details & Template */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-sm space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <FileText className="w-5 h-5 text-indigo-400" />
              <span>Journey Configuration</span>
            </h2>

            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-semibold text-slate-200 mb-1.5">
                Journey Title <span className="text-rose-400">*</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g., 30 Days of Rust or 100 Days of Building PostBot"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700/80 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-all"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                A descriptive title for your posting series or challenge.
              </p>
            </div>

            {/* Hashtags */}
            <div>
              <label htmlFor="hashtags" className="block text-sm font-semibold text-slate-200 mb-1.5 flex items-center gap-2">
                <Hash className="w-4 h-4 text-indigo-400" />
                <span>Hashtags (Comma-separated)</span>
              </label>
              <input
                id="hashtags"
                name="hashtags"
                type="text"
                value={formData.hashtags}
                onChange={handleChange}
                placeholder="#buildinpublic, #indiedev, #rust, #tech"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700/80 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-all"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Enter hashtags separated by commas. These will be parsed into a clean list and populated in <code className="text-indigo-300 font-mono text-xs bg-slate-800 px-1 py-0.5 rounded">{'{{hashtags}}'}</code>.
              </p>
            </div>

            {/* Template Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="template" className="block text-sm font-semibold text-slate-200">
                  Post Template <span className="text-rose-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleUsePresetTemplate}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium hover:underline transition-colors"
                >
                  Load Sample Template
                </button>
              </div>

              {/* Placeholder Helper Badges */}
              <div className="mb-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                    Available Placeholders (Click to insert):
                  </span>
                  <div className="flex items-center gap-1 text-[11px]">
                    {hasTopicPlaceholder ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" /> {'{{topic}}'} included
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                        <AlertCircle className="w-3 h-3" /> {'{{topic}}'} required
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {PLACEHOLDERS.map((p) => (
                    <button
                      key={p.tag}
                      type="button"
                      onClick={() => handleInsertPlaceholder(p.tag)}
                      title={`${p.label}: ${p.desc}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-indigo-600/30 border border-slate-700/80 hover:border-indigo-500/50 text-indigo-300 text-xs font-mono transition-all hover:scale-105 active:scale-95"
                    >
                      <Plus className="w-3 h-3 text-slate-400" />
                      <span>{p.tag}</span>
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                id="template"
                name="template"
                ref={templateRef}
                required
                rows={7}
                value={formData.template}
                onChange={handleChange}
                placeholder="Day {{n}} of #{{journeyTitle}} 🚀&#10;&#10;Today's focus: {{topic}}&#10;&#10;Key challenge: {{challenge}}&#10;&#10;{{hashtags}}"
                className="w-full px-4 py-3 rounded-xl bg-slate-950/70 border border-slate-700/80 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono leading-relaxed transition-all resize-y"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Template used to structure every generated daily LinkedIn post. Must include at least <code className="text-indigo-300 font-mono text-xs bg-slate-800 px-1 py-0.5 rounded">{'{{topic}}'}</code>.
              </p>
            </div>
          </div>

          {/* Schedule & Visual Style Card */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-sm space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Calendar className="w-5 h-5 text-indigo-400" />
              <span>Schedule & Image Styling</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Start Date */}
              <div>
                <label htmlFor="startDate" className="block text-sm font-semibold text-slate-200 mb-1.5 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  <span>Start Date</span>
                </label>
                <input
                  id="startDate"
                  name="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700/80 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-all [color-scheme:dark]"
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  When this posting journey begins.
                </p>
              </div>

              {/* Post Time */}
              <div>
                <label htmlFor="postTimeLocal" className="block text-sm font-semibold text-slate-200 mb-1.5 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span>Daily Post Time</span>
                </label>
                <input
                  id="postTimeLocal"
                  name="postTimeLocal"
                  type="time"
                  value={formData.postTimeLocal}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700/80 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-all [color-scheme:dark]"
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  Target local time for automated publishing.
                </p>
              </div>
            </div>

            {/* Image Style Input */}
            <div>
              <label htmlFor="imageStyle" className="block text-sm font-semibold text-slate-200 mb-1.5 flex items-center gap-2">
                <Palette className="w-4 h-4 text-indigo-400" />
                <span>Image Style Prompt</span>
              </label>
              <input
                id="imageStyle"
                name="imageStyle"
                type="text"
                value={formData.imageStyle}
                onChange={handleChange}
                placeholder="e.g., Minimalist 3D isometric illustration, cyberpunk neon accent, clean dark background"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700/80 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-all"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Visual prompt modifier applied when generating social preview images for this journey.
              </p>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <Link
              to="/journeys"
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-sm font-semibold transition-colors text-center"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Creating Journey...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Create Journey</span>
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default NewJourneyPage;
