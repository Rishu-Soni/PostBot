import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  Zap,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Mic,
  MicOff,
  Sliders,
  TrendingUp,
  AlertTriangle,
  MessageSquareQuote,
  Flame,
  Target,
} from 'lucide-react';
import { batchService } from '../../services/batchService';
import { useToast } from '../../context/ToastContext';
import { useSpeechToText } from '../../hooks/useSpeechToText';
import { VoiceTemplateVaultModal } from '../../components/modals/VoiceTemplateVaultModal';
import {
  getVoiceDNA,
  getAllLayoutTemplates,
  getBrainDumpDraft,
  saveBrainDumpDraft,
  getWeeklyGoalDraft,
  saveWeeklyGoalDraft,
  clearDrafts,
} from '../../utils/voiceVaultStorage';

const ROTATING_MESSAGES = [
  'Reading and digesting your notes...',
  'Extracting core throughlines and weekly themes...',
  'Auto-matching narrative arcs with layout templates...',
  'Formulating per-post angles and hook directions...',
  'Calculating optimal posting cadence...',
];

const THOUGHT_TRIGGERS = [
  {
    label: '+ 📈 Win or Metric',
    icon: TrendingUp,
    textToInsert: '\n• [Win/Metric]: What happened, exact numbers/%, and what caused it:\n',
  },
  {
    label: '+ 💥 Bug or Hard Lesson',
    icon: AlertTriangle,
    textToInsert: '\n• [Hard Lesson]: What broke or went wrong this week, and how we fixed it:\n',
  },
  {
    label: '+ 💬 Customer/Founder Quote',
    icon: MessageSquareQuote,
    textToInsert: '\n• [Conversation]: Something surprising a customer or peer said this week:\n',
  },
  {
    label: '+ 🔥 Unpopular Opinion',
    icon: Flame,
    textToInsert: '\n• [Hot Take]: Something everyone in my industry is doing wrong right now:\n',
  },
];

export const BatchIntakePage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const textareaRef = useRef(null);

  // Voice & Template Vault State
  const [voiceDNA, setVoiceDNA] = useState(getVoiceDNA);
  const [layoutTemplates, setLayoutTemplates] = useState(getAllLayoutTemplates);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);

  // Form State
  const [brainDump, setBrainDump] = useState(getBrainDumpDraft);
  const [weeklyGoal, setWeeklyGoal] = useState(getWeeklyGoalDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  // Sync draft auto-saving
  useEffect(() => {
    saveBrainDumpDraft(brainDump);
  }, [brainDump]);

  useEffect(() => {
    saveWeeklyGoalDraft(weeklyGoal);
  }, [weeklyGoal]);

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

  const handleVoiceTranscript = (chunk) => {
    setBrainDump((prev) => {
      const trimmed = prev.trimEnd();
      const textToAppend = chunk.trim();
      if (!textToAppend) return prev;
      const combined = trimmed ? `${trimmed} ${textToAppend}` : textToAppend;
      return combined.slice(0, 5000);
    });
  };

  const handleVoiceError = (errorMessage) => {
    showToast(errorMessage, 'error');
  };

  const {
    isSupported: isVoiceSupported,
    isListening,
    interimTranscript,
    stopListening,
    toggleListening,
  } = useSpeechToText({
    onTranscript: handleVoiceTranscript,
    onError: handleVoiceError,
  });

  const handleInsertTrigger = (triggerPrompt) => {
    setBrainDump((prev) => {
      const trimmed = prev.trimEnd();
      const newText = trimmed ? `${trimmed}${triggerPrompt}` : triggerPrompt.trimStart();
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = textareaRef.current.value.length;
          textareaRef.current.selectionEnd = textareaRef.current.value.length;
        }
      }, 15);
      return newText.slice(0, 5000);
    });
  };

  // Specificity & Depth Analyzer
  const analyzeSpecificity = (text) => {
    const trimmed = text.trim();
    if (trimmed.length < 100) {
      return {
        level: 'low',
        badge: '💡 Tip: Drop at least 2 raw stories or numbers for best results',
        badgeColor: 'text-amber-800 bg-amber-50 border-amber-200/80',
      };
    }

    const metricRegex = /(\$\d[\d,.]*|\b\d+(\.\d+)?(%|k|x|m|b)?\b)/gi;
    const metricsMatches = trimmed.match(metricRegex) || [];
    const metricCount = metricsMatches.length;

    const paragraphs = trimmed
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 15);
    const ideaCount = Math.max(1, paragraphs.length);

    if (ideaCount >= 2 && metricCount >= 2) {
      return {
        level: 'high',
        badge: `🔥 High Specificity: ${ideaCount} ideas & ${metricCount} concrete metrics detected (Great for 3–5 posts)`,
        badgeColor: 'text-emerald-800 bg-emerald-50 border-emerald-200/80',
      };
    }

    return {
      level: 'medium',
      badge: `📊 Detected: ~${ideaCount} distinct ideas & ${metricCount} metric${metricCount === 1 ? '' : 's'}`,
      badgeColor: 'text-blue-800 bg-blue-50 border-blue-200/80',
    };
  };

  const specificity = analyzeSpecificity(brainDump);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isListening) {
      stopListening();
    }

    if (!brainDump.trim() || brainDump.trim().length < 20) {
      showToast('Please provide a bit more context in your brain dump (at least a couple of sentences).', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await batchService.createBatch({
        brainDump: brainDump.trim(),
        weeklyGoal: weeklyGoal.trim(),
        voiceDNA,
        layoutTemplates,
        professionalLevel: voiceDNA.role,
        tone: voiceDNA.baseTone,
      });

      // Clear local drafts after successful batch initialization
      clearDrafts();

      // Navigate to recommendation & strategy review step
      navigate(`/batches/${data.batchId}/recommendation`, {
        state: {
          batchId: data.batchId,
          recommendedDayCount: data.recommendedDayCount,
          postsStrategy: data.postsStrategy || [],
          extractedTheme: data.extractedTheme || '',
          strategyOverview: data.strategyOverview || '',
        },
      });
    } catch (err) {
      showToast(err.message || 'Failed to analyze brain dump. Please try again.', 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pt-10 pb-8">
      {/* Header Banner */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-brand-soft text-brand border border-blue-100 shadow-2xs">
          <Zap className="w-3.5 h-3.5 fill-brand text-brand" />
          <span>Intake &amp; Strategy Arc</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight">
          New Weekly Batch
        </h1>
        <p className="text-[#64748B] text-sm sm:text-base leading-relaxed max-w-3xl">
          Tell us what&apos;s on your mind this week — we&apos;ll turn your raw ideas, customer conversations, and metrics into a week of polished LinkedIn posts.{' '}
          <span className="text-ink font-semibold">Zero credits charged for this step.</span>
        </p>
      </div>

      {/* Main Elevated Form Container Card */}
      <div className="bg-surface-card border border-border-warm rounded-2xl p-6 sm:p-8 lg:p-10 shadow-md space-y-6">
        {/* COMPACT ACTIVE VOICE & TEMPLATE DNA BAR (TOP OF CARD) */}
        <div className="p-3.5 rounded-xl bg-surface border border-border-warm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-ink">
            <span className="font-semibold text-[#64748B] flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-brand" />
              Active Voice DNA:
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white border border-border-warm font-semibold text-ink shadow-2xs">
              <span className="text-[#64748B] font-normal">Role:</span> {voiceDNA.role}
            </span>
            <span className="text-slate-300 hidden sm:inline">•</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white border border-border-warm font-semibold text-ink shadow-2xs">
              <span className="text-[#64748B] font-normal">Tone:</span> {voiceDNA.baseTone}
            </span>
            <span className="text-slate-300 hidden sm:inline">•</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white border border-border-warm font-semibold text-brand shadow-2xs">
              {layoutTemplates.length} Layout Templates
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsVaultModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-brand bg-brand-soft hover:bg-blue-100 border border-blue-200 transition-colors shadow-2xs cursor-pointer shrink-0"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Customize Voice &amp; Templates</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* SECTION 1: Brain Dump Area */}
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="brain-dump" className="text-sm font-bold text-ink flex items-center gap-1">
                Your Brain Dump
                <span className="text-coral text-base font-bold leading-none">*</span>
              </label>

              {/* LIVE SPECIFICITY & DEPTH METER + CHAR COUNTER */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border transition-all ${specificity.badgeColor}`}
                >
                  {specificity.badge}
                </span>
                <span
                  className={`text-xs font-semibold font-mono tracking-tight ${
                    brainDump.length > 4500 ? 'text-coral' : 'text-[#64748B]'
                  }`}
                >
                  {brainDump.length.toLocaleString()} / 5,000 chars
                </span>
              </div>
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Drop your raw unfiltered notes, metric updates, bug postmortems, customer talks, or hot takes. No formatting needed.
            </p>

            {/* Guided Thought-Trigger Chips Toolbar */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-[#64748B] mr-1 hidden sm:inline">
                Thought Triggers:
              </span>
              {THOUGHT_TRIGGERS.map((trigger) => {
                const IconComponent = trigger.icon;
                return (
                  <button
                    key={trigger.label}
                    type="button"
                    onClick={() => handleInsertTrigger(trigger.textToInsert)}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-ink bg-white border border-border-warm hover:border-brand/40 hover:bg-brand-soft/30 hover:text-brand transition-all shadow-2xs cursor-pointer active:scale-95"
                  >
                    <IconComponent className="w-3.5 h-3.5 text-brand" />
                    <span>{trigger.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Brain Dump Textarea */}
            <div className="relative group rounded-xl bg-white border border-border-warm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15 transition-all shadow-inner overflow-hidden mt-2">
              <textarea
                ref={textareaRef}
                id="brain-dump"
                rows={8}
                value={brainDump}
                onChange={(e) => setBrainDump(e.target.value)}
                maxLength={5000}
                placeholder="Example: This week we shipped our self-hosted billing engine. Found out 65% of dropoffs occurred at the payment method modal. Fixed it by caching customer profiles, and signups jumped 2x. Also had a great call with a founder who scaled to $50k MRR using cold email with zero ad spend..."
                className="w-full bg-transparent border-0 text-ink text-sm leading-relaxed p-4 focus:ring-0 placeholder:text-[#94A3B8] resize-none font-normal"
                disabled={isSubmitting}
              />

              {/* Textarea Bottom Utility Bar */}
              <div className="px-4 py-2.5 border-t border-border-light bg-surface/60 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleListening}
                    disabled={isSubmitting}
                    title={
                      !isVoiceSupported
                        ? 'Speech recognition is not supported in this browser'
                        : isListening
                        ? 'Stop dictation'
                        : 'Start voice dictation'
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-2xs cursor-pointer ${
                      isListening
                        ? 'bg-red-50 text-red-600 border border-red-200 shadow-sm'
                        : 'text-ink bg-white border border-border-warm hover:bg-surface hover:text-ink'
                    }`}
                  >
                    {isListening ? (
                      <>
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
                        </span>
                        <MicOff className="w-3.5 h-3.5 text-red-600" />
                        <span>Listening... (Stop)</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5 text-brand" />
                        <span>Voice to Text</span>
                      </>
                    )}
                  </button>

                  {isListening && interimTranscript && (
                    <span className="text-xs text-[#64748B] italic max-w-xs truncate pl-1 hidden sm:inline-block">
                      &quot;{interimTranscript}&quot;
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-[#64748B] font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Draft saved locally</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: LIGHTWEIGHT OPTIONAL WEEKLY GOAL FIELD */}
          <div className="space-y-2 pt-2 border-t border-border-light">
            <label htmlFor="weekly-goal" className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-brand" />
              <span>Weekly Goal or Plug (Optional)</span>
            </label>
            <input
              id="weekly-goal"
              type="text"
              value={weeklyGoal}
              onChange={(e) => setWeeklyGoal(e.target.value)}
              placeholder="e.g., Launching self-hosted billing on Thursday, hiring a founding engineer, or driving newsletter signups..."
              disabled={isSubmitting}
              className="w-full bg-white border border-border-warm rounded-xl px-3.5 py-2.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 placeholder:text-[#94A3B8] shadow-2xs font-medium"
            />
            <p className="text-[11px] text-[#64748B]">
              Leave blank if you just want pure engagement &amp; authority posts.
            </p>
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
                Analyzing narrative density, extracting throughlines, and pairing stories with layout skeletons...
              </p>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-6 border-t border-border-light flex flex-col sm:flex-row items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-[#64748B] hover:text-ink rounded-xl hover:bg-surface transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-3">
              <span className="text-xs text-[#64748B] font-medium leading-normal text-center sm:text-right hidden sm:block">
                Takes ~15s to analyze depth &amp; recommend posts
              </span>
              <button
                type="submit"
                disabled={isSubmitting || !brainDump.trim()}
                className="w-full sm:w-auto px-7 py-3 bg-[#1E88E5] hover:bg-[#1565C0] text-[#FFFFFF] text-sm font-semibold rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 group active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
        <p className="text-xs text-[#64748B] leading-relaxed flex items-center justify-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-brand" />
          <span>
            PostBot creates high-impact post drafts with matching visual suggestions based on your input.
          </span>
        </p>
      </footer>

      {/* Voice DNA & Template Vault Modal */}
      <VoiceTemplateVaultModal
        isOpen={isVaultModalOpen}
        onClose={() => setIsVaultModalOpen(false)}
        onSaved={(updatedDNA) => {
          setVoiceDNA(updatedDNA);
          setLayoutTemplates(getAllLayoutTemplates());
          showToast('Voice DNA & Templates updated', 'success');
        }}
      />
    </div>
  );
};
