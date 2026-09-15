import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  Zap,
  Mic,
  ListPlus,
  Check,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { batchService } from '../../services/batchService';
import { useToast } from '../../context/ToastContext';

const ROTATING_MESSAGES = [
  'Reading and digesting your notes...',
  'Finding the hidden throughlines and hooks...',
  'Structuring a high-converting narrative arc...',
  'Extracting actionable founder takeaways...',
  'Calculating optimal posting cadence...',
];

const TARGET_IDENTITIES = [
  'Senior Founder / CEO',
  'Early-Stage Solo Bootstrapper',
  'B2B SaaS Product Leader',
  'Technical Co-founder / CTO',
  'Growth Engineer & Marketer',
];

const TONE_PRESETS = [
  'Direct & Contrarian',
  'Empathetic & Narrative',
  'Analytical & Data-Driven',
  'Pragmatic & Technical',
  'Visionary & Strategic',
];

const STYLE_PRESETS = [
  'Short punchy sentences with bullet lists',
  'Actionable teardowns with frameworks',
  'Personal founder journey with metrics',
  'Conversational with a strong provocative opening hook',
  'Deep-dive case study with breakdown',
];

export const BatchIntakePage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [theme, setTheme] = useState('');
  const [professionalLevel, setProfessionalLevel] = useState('Senior Founder / CEO');
  const [tone, setTone] = useState('Direct & Contrarian');
  const [writingStyle, setWritingStyle] = useState('Short punchy sentences with bullet lists');
  const [brainDump, setBrainDump] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  // Rotating loading messages
  useEffect(() => {
    let timer;
    if (isSubmitting) {
      timer = setInterval(() => {
        setLoadingMessageIndex((prev) => (prev + 1) % ROTATING_MESSAGES.length);
      }, 2400);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isSubmitting]);

  const handlePasteVoiceMemo = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setBrainDump((prev) => (prev ? `${prev}\n\n${text}` : text));
          showToast('Pasted transcript from clipboard!', 'success');
          return;
        }
      }
    } catch {
      // Clipboard permissions denied, fallback to sample voice note
    }
    const sampleMemo = `[Voice Memo Transcript]: This week we noticed a big issue with user dropoff at the billing step. We removed the extra form fields, cached company profiles, and checkout conversion immediately jumped 2x. Biggest lesson: stop asking for info you can automatically detect.`;
    setBrainDump((prev) => (prev ? `${prev}\n\n${sampleMemo}` : sampleMemo));
    showToast('Inserted voice memo template', 'info');
  };

  const handleInsertBulletTemplate = () => {
    const template = `• What we shipped / built this week:\n• Surprising customer metric or feedback:\n• One painful mistake or lesson learned:\n• What we are doubling down on next week:`;
    setBrainDump((prev) => (prev ? `${prev}\n\n${template}` : template));
    showToast('Inserted bullet template', 'info');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!brainDump.trim() || brainDump.trim().length < 20) {
      showToast('Please provide a bit more context in your brain dump (at least a couple of sentences).', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await batchService.createBatch({
        theme: theme.trim() || 'Weekly Founder Insights',
        professionalLevel,
        tone,
        writingStyle,
        brainDump: brainDump.trim(),
      });

      // Navigate to recommendation step
      navigate(`/batches/${data.batchId}/recommendation`, {
        state: {
          batchId: data.batchId,
          recommendedDayCount: data.recommendedDayCount,
        },
      });
    } catch (err) {
      showToast(err.message || 'Failed to analyze brain dump. Please try again.', 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in py-2">
      {/* Header Banner */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-brand-soft text-brand border border-blue-100 shadow-2xs">
          <Zap className="w-3.5 h-3.5 fill-brand text-brand" />
          <span>Intake &amp; Strategy Arc</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight">
          New Weekly Batch
        </h1>
        <p className="text-ink-muted text-sm sm:text-base leading-relaxed max-w-3xl">
          Tell us what&apos;s on your mind this week — we&apos;ll turn your raw ideas, customer conversations, and metrics into a week of polished LinkedIn posts.{' '}
          <span className="text-ink font-semibold">Zero credits charged for this step.</span>
        </p>
      </div>

      {/* Main Elevated Form Container Card */}
      <div className="bg-surface-card border border-border-warm rounded-2xl p-6 sm:p-8 lg:p-10 shadow-md">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* SECTION 1: Brain Dump Area */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="brain-dump" className="text-sm font-bold text-ink flex items-center gap-1">
                Your Brain Dump
                <span className="text-coral text-base font-bold leading-none">*</span>
              </label>
              <span
                className={`text-xs font-semibold font-mono tracking-tight ${
                  brainDump.length > 4500 ? 'text-coral' : 'text-ink-subtle'
                }`}
              >
                {brainDump.length.toLocaleString()} / 5,000 chars
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              Type or paste bullet points, voice note transcripts, wins, customer feedback, bugs, or lessons from your week. Don&apos;t worry about formatting.
            </p>

            <div className="relative group rounded-xl bg-white border border-border-warm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15 transition-all shadow-inner overflow-hidden">
              <textarea
                id="brain-dump"
                rows={7}
                value={brainDump}
                onChange={(e) => setBrainDump(e.target.value)}
                maxLength={5000}
                placeholder="Example: This week we shipped our self-hosted billing engine. Found out 65% of dropoffs occurred at the payment method modal. Fixed it by caching customer profiles, and signups jumped 2x. Also had a great call with a founder who scaled to $50k MRR using cold email with zero ad spend..."
                className="w-full bg-transparent border-0 text-ink text-sm leading-relaxed p-4 focus:ring-0 placeholder:text-ink-subtle resize-none font-normal"
                disabled={isSubmitting}
              />

              {/* Textarea Bottom Utility Bar */}
              <div className="px-4 py-2.5 border-t border-border-light bg-surface/60 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePasteVoiceMemo}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-ink bg-white border border-border-warm hover:bg-surface hover:text-ink transition-colors shadow-2xs cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5 text-coral" />
                    <span>Paste Voice Memo</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleInsertBulletTemplate}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-ink bg-white border border-border-warm hover:bg-surface hover:text-ink transition-colors shadow-2xs cursor-pointer"
                  >
                    <ListPlus className="w-3.5 h-3.5 text-brand" />
                    <span>Bullet Template</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-ink-subtle font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Draft saved locally</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Weekly Theme & Target Identity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-border-light">
            {/* Weekly Theme */}
            <div className="space-y-2">
              <label htmlFor="weekly-theme" className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Weekly Theme or Focus
              </label>
              <input
                id="weekly-theme"
                type="text"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="e.g. Bootstrapping a SaaS to $10k MRR"
                disabled={isSubmitting}
                className="w-full bg-white border border-border-warm rounded-xl px-3.5 py-2.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 placeholder:text-ink-subtle shadow-2xs font-medium"
              />
            </div>

            {/* Target Identity */}
            <div className="space-y-2">
              <label htmlFor="target-identity" className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Target Identity / Level
              </label>
              <div className="relative">
                <select
                  id="target-identity"
                  value={professionalLevel}
                  onChange={(e) => setProfessionalLevel(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full appearance-none bg-white border border-border-warm rounded-xl px-3.5 py-2.5 text-sm text-ink font-medium focus:border-brand focus:ring-2 focus:ring-brand/15 shadow-2xs pr-10 cursor-pointer"
                >
                  {TARGET_IDENTITIES.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-ink-muted">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: Voice Tone & Writing Style */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Voice Tone */}
            <div className="space-y-2">
              <label htmlFor="voice-tone" className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Voice Tone
              </label>
              <div className="relative">
                <select
                  id="voice-tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full appearance-none bg-white border border-border-warm rounded-xl px-3.5 py-2.5 text-sm text-ink font-medium focus:border-brand focus:ring-2 focus:ring-brand/15 shadow-2xs pr-10 cursor-pointer"
                >
                  {TONE_PRESETS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-ink-muted">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Writing Style */}
            <div className="space-y-2">
              <label htmlFor="style-preset" className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Writing Style Preset
              </label>
              <div className="relative">
                <select
                  id="style-preset"
                  value={writingStyle}
                  onChange={(e) => setWritingStyle(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full appearance-none bg-white border border-border-warm rounded-xl px-3.5 py-2.5 text-sm text-ink font-medium focus:border-brand focus:ring-2 focus:ring-brand/15 shadow-2xs pr-10 cursor-pointer"
                >
                  {STYLE_PRESETS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-ink-muted">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Style Suggestions Chips */}
          <div className="space-y-2.5 pt-2">
            <span className="text-xs font-medium text-ink-muted block">Quick style suggestions:</span>
            <div className="flex flex-wrap gap-2">
              {STYLE_PRESETS.slice(0, 4).map((preset) => {
                const isSelected = writingStyle === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setWritingStyle(preset)}
                    disabled={isSubmitting}
                    className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-brand-soft text-brand border border-brand/30'
                        : 'bg-white text-ink-muted border border-border-warm hover:border-ink-muted hover:bg-surface'
                    }`}
                  >
                    <span>{preset}</span>
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Loading state overlay when submitting */}
          {isSubmitting && (
            <div className="p-6 rounded-2xl bg-brand-soft border border-brand/20 space-y-3 animate-fade-in">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-brand animate-spin" />
                <span className="text-sm font-bold text-brand">
                  {ROTATING_MESSAGES[loadingMessageIndex]}
                </span>
              </div>
              <div className="w-full bg-white/60 h-1.5 rounded-full overflow-hidden">
                <div className="bg-brand h-full rounded-full animate-pulse w-3/4 transition-all duration-500" />
              </div>
              <p className="text-xs text-brand-text">
                Analyzing narrative density, identifying peak days, and formulating hooks...
              </p>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-6 border-t border-border-light flex flex-col sm:flex-row items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-ink-muted hover:text-ink rounded-xl hover:bg-surface transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-3">
              <span className="text-xs text-ink-muted font-medium text-center sm:text-right hidden sm:block">
                Takes ~15s to analyze depth &amp; recommend posts
              </span>
              <button
                type="submit"
                disabled={isSubmitting || !brainDump.trim()}
                className="w-full sm:w-auto px-7 py-3 bg-coral hover:bg-coral-hover text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 group active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing Brain Dump...</span>
                  </>
                ) : (
                  <>
                    <span>Elaborate My Week</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1 duration-200" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Contextual Bottom Tip Footer */}
      <footer className="text-center pb-8">
        <p className="text-xs text-ink-muted flex items-center justify-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-brand" />
          <span>
            PostBot creates high-impact post drafts with matching visual suggestions based on your input.
          </span>
        </p>
      </footer>
    </div>
  );
};
