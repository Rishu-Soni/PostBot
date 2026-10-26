import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles,
  Minus,
  Plus,
  Coins,
  ArrowRight,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sliders,
  Edit3,
  Quote,
  Compass,
} from 'lucide-react';
import { batchService } from '../../services/batchService';
import { useCredits } from '../../context/CreditsContext';
import { useToast } from '../../context/ToastContext';
import { getAllLayoutTemplates } from '../../utils/voiceVaultStorage';

// Helper: format Date object to 'YYYY-MM-DD'
const formatDateKey = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper: format 'YYYY-MM-DD' to friendly string like 'Mon, Sep 21'
const formatReadableDate = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

// Helper: generate smart default dates based on preset
const generatePresetDates = (count, presetType = 'alternating') => {
  const dates = [];
  const curr = new Date();
  curr.setDate(curr.getDate() + 1); // Start tomorrow

  if (presetType === 'weekdays') {
    while (dates.length < count) {
      const day = curr.getDay();
      if (day !== 0 && day !== 6) {
        dates.push(formatDateKey(curr));
      }
      curr.setDate(curr.getDate() + 1);
    }
  } else if (presetType === 'daily') {
    while (dates.length < count) {
      dates.push(formatDateKey(curr));
      curr.setDate(curr.getDate() + 1);
    }
  } else {
    // Alternating days (e.g. Mon, Wed, Fri)
    while (dates.length < count) {
      dates.push(formatDateKey(curr));
      curr.setDate(curr.getDate() + 2);
    }
  }
  return dates;
};

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const POST_TONE_OVERRIDES = [
  'Direct & Contrarian',
  'Actionable Teardown',
  'Personal Story',
  'Deep-Dive Case Study',
  'Tactical & Data-Backed',
  'Conversational & Story-Driven',
];

export const DayCountRecommendPage = () => {
  const { batchId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { creditBalance, refreshBalance } = useCredits();
  const { showToast } = useToast();

  const [availableTemplates] = useState(getAllLayoutTemplates);

  const initialRecommended = location.state?.recommendedDayCount || 5;
  const [recommendedDayCount, setRecommendedDayCount] = useState(initialRecommended);
  const [selectedDayCount, setSelectedDayCount] = useState(initialRecommended);

  // Strategy & Extracted Theme State
  const [extractedTheme, setExtractedTheme] = useState(location.state?.extractedTheme || '');
  const [strategyOverview, setStrategyOverview] = useState(location.state?.strategyOverview || '');
  const [postsStrategy, setPostsStrategy] = useState(() => {
    const passed = location.state?.postsStrategy;
    if (Array.isArray(passed) && passed.length > 0) {
      return passed;
    }
    // Fallback stub strategy for initialRecommended days
    return Array.from({ length: initialRecommended }, (_, i) => ({
      dayIndex: i + 1,
      subtopic: `Day ${i + 1} Founder Insight`,
      angle: 'Actionable lesson or metric from weekly build',
      hookPreview: 'The single biggest lesson we learned this week...',
      matchedTemplateId: i % 2 === 0 ? 'metric-teardown' : 'tactical-framework',
      matchedTemplateName: i % 2 === 0 ? 'The Metric Teardown' : 'The Tactical Framework',
      tone: 'Direct & Contrarian',
    }));
  });

  const [selectedDates, setSelectedDates] = useState(() =>
    generatePresetDates(initialRecommended, 'alternating')
  );
  const [currentMonthDate, setCurrentMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState('');

  // Bounds: min 1 (or max 1, recommended - 2), max min(10, recommended + 2)
  const minDays = Math.max(1, Math.min(3, recommendedDayCount - 2));
  const maxDays = Math.min(10, Math.max(5, recommendedDayCount + 2));

  // Credit calculation
  const creditsNeeded = selectedDayCount;
  const hasEnoughCredits = creditBalance >= creditsNeeded;
  const remainingCredits = creditBalance - creditsNeeded;

  useEffect(() => {
    // If user arrived directly without state, fetch the batch
    if ((!location.state?.postsStrategy || !location.state?.recommendedDayCount) && batchId) {
      batchService
        .getBatchById(batchId)
        .then((res) => {
          if (res?.batch) {
            const b = res.batch;
            const rec = b.recommendedDayCount || 5;
            const finalCount = b.finalDayCount || rec;
            setRecommendedDayCount(rec);
            setSelectedDayCount(finalCount);

            if (b.extractedTheme) setExtractedTheme(b.extractedTheme);
            if (b.strategyOverview) setStrategyOverview(b.strategyOverview);

            if (Array.isArray(b.postsStrategy) && b.postsStrategy.length > 0) {
              setPostsStrategy(b.postsStrategy);
            }

            setSelectedDates((prev) => {
              if (prev.length === finalCount) return prev;
              return generatePresetDates(finalCount, 'alternating');
            });
          }
        })
        .catch((err) => {
          showToast(err.message || 'Failed to load batch recommendation.', 'error');
        });
    }
  }, [batchId, location.state, showToast]);

  const handleDecrement = () => {
    if (selectedDayCount > minDays) {
      const nextCount = selectedDayCount - 1;
      setSelectedDayCount(nextCount);
      setSelectedDates((prev) => prev.slice(0, nextCount));
    }
  };

  const handleIncrement = () => {
    if (selectedDayCount < maxDays) {
      const nextCount = selectedDayCount + 1;
      setSelectedDayCount(nextCount);

      // Ensure postsStrategy has an entry for the new day
      setPostsStrategy((prev) => {
        if (prev.length >= nextCount) return prev;
        const newCard = {
          dayIndex: nextCount,
          subtopic: `Day ${nextCount} Framework & Reflection`,
          angle: 'Tactical breakdown and key metrics',
          hookPreview: 'Something counter-intuitive we realized this week...',
          matchedTemplateId: 'tactical-framework',
          matchedTemplateName: 'The Tactical Framework',
          tone: 'Direct & Contrarian',
        };
        return [...prev, newCard];
      });

      setSelectedDates((prev) => {
        if (prev.length >= nextCount) return prev.slice(0, nextCount);
        let nextDate;
        if (prev.length > 0) {
          const lastStr = prev[prev.length - 1];
          const [y, m, d] = lastStr.split('-').map(Number);
          const dt = new Date(y, m - 1, d);
          dt.setDate(dt.getDate() + 2);
          nextDate = formatDateKey(dt);
        } else {
          const dt = new Date();
          dt.setDate(dt.getDate() + 1);
          nextDate = formatDateKey(dt);
        }
        return [...prev, nextDate].sort();
      });
    }
  };

  const handleUpdatePostCard = (index, field, value) => {
    setPostsStrategy((prev) => {
      const copy = [...prev];
      if (!copy[index]) return prev;

      if (field === 'matchedTemplateId') {
        const found = availableTemplates.find((t) => t.id === value);
        copy[index] = {
          ...copy[index],
          matchedTemplateId: value,
          matchedTemplateName: found?.name || value,
        };
      } else {
        copy[index] = {
          ...copy[index],
          [field]: value,
        };
      }
      return copy;
    });
  };

  const todayKey = formatDateKey(new Date());

  // Month navigation logic
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const monthLabel = currentMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const isCurrentMonthOrPast = () => {
    const now = new Date();
    return year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth());
  };

  const goToPrevMonth = () => {
    if (!isCurrentMonthOrPast()) {
      setCurrentMonthDate(new Date(year, month - 1, 1));
    }
  };

  const goToNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  const handleDateClick = (dateKey) => {
    if (dateKey < todayKey) return;

    if (selectedDates.includes(dateKey)) {
      if (selectedDates.length > 1) {
        setSelectedDates((prev) => prev.filter((d) => d !== dateKey));
      } else {
        showToast('At least one date must remain selected.', 'info');
      }
    } else {
      if (selectedDates.length < selectedDayCount) {
        setSelectedDates((prev) => [...prev, dateKey].sort());
      } else {
        const updated = [...selectedDates.slice(0, selectedDayCount - 1), dateKey].sort();
        setSelectedDates(updated);
      }
    }
  };

  const applyPreset = (presetType) => {
    const dates = generatePresetDates(selectedDayCount, presetType);
    setSelectedDates(dates);
    showToast(`Applied ${presetType} schedule preset`, 'info');
  };

  // Calendar math
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const blankDays = Array.from({ length: firstDayIndex });
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const handleGenerate = async () => {
    if (!hasEnoughCredits) {
      showToast(`Insufficient credits. You need ${creditsNeeded} credits, but have ${creditBalance}.`, 'error');
      return;
    }

    if (selectedDates.length !== selectedDayCount) {
      showToast(
        `Please select exactly ${selectedDayCount} dates (currently ${selectedDates.length} selected).`,
        'warning'
      );
      return;
    }

    setIsGenerating(true);
    setGenerationStep('Formatting per-post layout skeletons...');

    try {
      setTimeout(() => setGenerationStep('Applying post-specific tones and anti-cringe rules...'), 1200);
      setTimeout(() => setGenerationStep('Generating magnetic hooks and body captions...'), 2600);

      // Package customized post configs for the selected days
      const activePostConfigs = postsStrategy.slice(0, selectedDayCount).map((card, idx) => {
        const fullTemplate = availableTemplates.find((t) => t.id === card.matchedTemplateId) || {
          name: card.matchedTemplateName,
          skeleton: card.matchedTemplateName,
        };
        return {
          dayIndex: card.dayIndex || idx + 1,
          subtopic: card.subtopic,
          angle: card.angle,
          hookPreview: card.hookPreview,
          layoutTemplate: fullTemplate,
          matchedTemplateName: card.matchedTemplateName,
          tone: card.tone,
        };
      });

      const res = await batchService.updateDayCount(
        batchId,
        selectedDayCount,
        selectedDates,
        activePostConfigs
      );
      refreshBalance();
      showToast(`Successfully generated ${selectedDayCount} days of tailored content!`, 'success');
      navigate(`/batches/${batchId}/review`, { state: { batch: res.batch, posts: res.posts } });
    } catch (err) {
      showToast(err.message || 'Post generation failed. Please retry.', 'error');
      setIsGenerating(false);
    }
  };

  const displayedCards = postsStrategy.slice(0, selectedDayCount);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in py-8">
      {/* Header Eyebrow & Titles */}
      <div className="text-center space-y-3 flex flex-col items-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-soft border border-blue-100 text-xs font-semibold text-brand shadow-2xs">
          <Sparkles className="w-3.5 h-3.5 fill-brand" />
          <span>Intake &amp; Strategy Arc — Step 2</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight">
          Strategy &amp; Layout Matcher
        </h1>
        <p className="text-sm sm:text-base text-ink-muted max-w-2xl font-normal leading-relaxed">
          Review your AI-extracted weekly theme, customize layout skeletons per post, and choose your publishing cadence before generating.
        </p>
      </div>

      {/* Main Elevated Container */}
      <div className="w-full bg-surface-card rounded-2xl border border-border-warm shadow-md p-6 sm:p-8 lg:p-10 flex flex-col gap-8">
        {/* AI Theme & Capacity Banner */}
        <div className="bg-brand-soft border border-blue-200/60 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-bold tracking-wider text-brand uppercase bg-white/90 px-2.5 py-0.5 rounded border border-blue-100">
              Extracted Weekly Focus
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight">
              {extractedTheme || 'Weekly Founder Growth & Engineering Insights'}
            </h2>
            {strategyOverview && (
              <p className="text-xs text-[#64748B] max-w-xl line-clamp-2">
                {strategyOverview}
              </p>
            )}
          </div>

          <div className="bg-white border border-border-warm rounded-xl p-3 text-center sm:text-right shrink-0 shadow-2xs">
            <span className="text-[11px] font-semibold text-[#64748B] block">Supported Cadence:</span>
            <span className="text-sm font-bold text-brand">
              {recommendedDayCount} High-Impact Days
            </span>
          </div>
        </div>

        {/* SECTION 1: PER-POST STRATEGY CARDS & LAYOUT SKELETON MATCHER */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-light pb-3">
            <div>
              <h3 className="text-base font-extrabold text-ink flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand" />
                <span>Per-Post Strategy &amp; Layout Controls</span>
              </h3>
              <p className="text-xs text-[#64748B]">
                Control the hook angle, layout skeleton, and voice tone override for every single post.
              </p>
            </div>
            <span className="text-xs font-bold text-brand bg-brand-soft px-3 py-1 rounded-full border border-blue-100 self-start sm:self-auto">
              {displayedCards.length} Posts Configured
            </span>
          </div>

          <div className="space-y-4">
            {displayedCards.map((card, index) => {
              const matchedTemplate =
                availableTemplates.find((t) => t.id === card.matchedTemplateId) ||
                availableTemplates[0];

              const scheduledDateStr = selectedDates[index];

              return (
                <div
                  key={card.dayIndex || index}
                  className="p-5 rounded-2xl bg-white border border-border-warm hover:border-brand/40 transition-all shadow-xs space-y-4"
                >
                  {/* Card Header: Day indicator, Title & Scheduled Date */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-[#1E88E5] text-white shadow-2xs">
                        Post #{index + 1}
                      </span>
                      <input
                        type="text"
                        value={card.subtopic}
                        onChange={(e) => handleUpdatePostCard(index, 'subtopic', e.target.value)}
                        placeholder="Sub-topic focus..."
                        className="text-sm font-bold text-ink bg-transparent border-b border-transparent hover:border-border-warm focus:border-brand focus:ring-0 px-1 py-0.5"
                      />
                    </div>

                    {scheduledDateStr && (
                      <span className="text-[11px] font-semibold text-[#64748B] bg-surface px-2.5 py-1 rounded-lg border border-border-warm">
                        🗓️ {formatReadableDate(scheduledDateStr)}
                      </span>
                    )}
                  </div>

                  {/* Core Angle & Hook Preview (Editable Inline) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1">
                        <Compass className="w-3 h-3 text-brand" />
                        <span>Core Angle &amp; Takeaway</span>
                      </label>
                      <textarea
                        rows={2}
                        value={card.angle}
                        onChange={(e) => handleUpdatePostCard(index, 'angle', e.target.value)}
                        placeholder="Core angle or lesson..."
                        className="w-full bg-surface border border-border-warm rounded-xl p-2.5 text-xs text-ink focus:border-brand focus:ring-1 focus:ring-brand shadow-inner resize-none font-medium"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1">
                        <Quote className="w-3 h-3 text-brand" />
                        <span>Hook Preview (First 1-2 Lines)</span>
                      </label>
                      <textarea
                        rows={2}
                        value={card.hookPreview}
                        onChange={(e) => handleUpdatePostCard(index, 'hookPreview', e.target.value)}
                        placeholder="Magnetic opening hook preview..."
                        className="w-full bg-surface border border-border-warm rounded-xl p-2.5 text-xs text-ink focus:border-brand focus:ring-1 focus:ring-brand shadow-inner resize-none font-medium"
                      />
                    </div>
                  </div>

                  {/* Controls: Layout Skeleton Selector + Tone Override */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border-light">
                    {/* Layout Skeleton Selector */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] flex items-center justify-between">
                        <span>Assigned Layout Skeleton</span>
                        <span className="text-[10px] text-brand font-semibold">
                          {matchedTemplate?.category || 'Template'}
                        </span>
                      </label>
                      <div className="relative">
                        <select
                          value={card.matchedTemplateId}
                          onChange={(e) =>
                            handleUpdatePostCard(index, 'matchedTemplateId', e.target.value)
                          }
                          className="w-full appearance-none bg-white border border-border-warm rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:border-brand focus:ring-1 focus:ring-brand shadow-2xs cursor-pointer"
                        >
                          {availableTemplates.map((tmpl) => (
                            <option key={tmpl.id} value={tmpl.id}>
                              {tmpl.name} ({tmpl.category || 'Built-in'})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Skeleton Flow Visual Preview */}
                      <div className="p-2 rounded-lg bg-surface border border-border-light font-mono text-[10px] text-ink-muted leading-relaxed">
                        {matchedTemplate?.skeleton}
                      </div>
                    </div>

                    {/* Post-Specific Tone Override */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                        Post Tone Override
                      </label>
                      <select
                        value={card.tone}
                        onChange={(e) => handleUpdatePostCard(index, 'tone', e.target.value)}
                        className="w-full appearance-none bg-white border border-border-warm rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:border-brand focus:ring-1 focus:ring-brand shadow-2xs cursor-pointer"
                      >
                        {POST_TONE_OVERRIDES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-[#94A3B8] pt-1">
                        Tailor the tone of this specific post independently from the rest of the batch.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 2: CADENCE STEPPER & CALENDAR SCHEDULER */}
        <div className="space-y-6 pt-4 border-t border-border-light">
          <div className="flex flex-col gap-4">
            {/* Stepper Header */}
            <div className="flex items-center justify-between text-xs font-semibold text-ink-muted px-1">
              <span>Min: {minDays} days</span>
              <span className="text-ink uppercase tracking-wider text-[11px] font-bold">
                Batch Cadence &amp; Schedule
              </span>
              <span>Max: {maxDays} days</span>
            </div>

            {/* Stepper Control */}
            <div className="bg-surface border border-border-warm rounded-xl p-4 flex items-center justify-between shadow-2xs">
              <button
                type="button"
                onClick={handleDecrement}
                disabled={selectedDayCount <= minDays || isGenerating}
                aria-label="Decrease days"
                className="w-12 h-12 rounded-xl bg-white border border-border-warm text-ink hover:border-brand hover:text-brand disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer"
              >
                <Minus className="w-5 h-5 stroke-[2.5]" />
              </button>

              <div className="flex flex-col items-center">
                <span className="text-4xl sm:text-5xl font-black text-ink tracking-tight leading-none">
                  {selectedDayCount}
                </span>
                <span className="text-[11px] font-bold tracking-wider text-ink-muted uppercase mt-1">
                  Days of Posts
                </span>
              </div>

              <button
                type="button"
                onClick={handleIncrement}
                disabled={selectedDayCount >= maxDays || isGenerating}
                aria-label="Increase days"
                className="w-12 h-12 rounded-xl bg-white border border-border-warm text-ink hover:border-brand hover:text-brand disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>

            {/* Calendar Section */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-brand" />
                  <span className="text-xs font-bold uppercase tracking-wider text-ink">
                    Schedule Dates
                  </span>
                </div>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    selectedDates.length === selectedDayCount
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                >
                  {selectedDates.length} of {selectedDayCount} dates selected
                </span>
              </div>

              {/* Interactive Calendar Box */}
              <div className="bg-white border border-border-warm rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-sm font-bold text-ink tracking-tight">{monthLabel}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={goToPrevMonth}
                      disabled={isCurrentMonthOrPast()}
                      aria-label="Previous Month"
                      className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-surface border border-border-warm disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={goToNextMonth}
                      aria-label="Next Month"
                      className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-surface border border-border-warm transition-colors cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center">
                  {WEEKDAY_NAMES.map((name) => (
                    <div key={name} className="text-[11px] font-bold text-ink-muted py-0.5">
                      {name}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1 text-center">
                  {blankDays.map((_, i) => (
                    <div key={`blank-${i}`} className="h-9" />
                  ))}

                  {monthDays.map((dayNum) => {
                    const dateObj = new Date(year, month, dayNum);
                    const dateKey = formatDateKey(dateObj);
                    const isPast = dateKey < todayKey;
                    const isToday = dateKey === todayKey;
                    const isSelected = selectedDates.includes(dateKey);
                    const postIndex = selectedDates.indexOf(dateKey);

                    return (
                      <button
                        key={dateKey}
                        type="button"
                        disabled={isPast || isGenerating}
                        onClick={() => handleDateClick(dateKey)}
                        className={`relative h-9 rounded-xl text-xs font-semibold flex flex-col items-center justify-center transition-all ${
                          isPast
                            ? 'text-ink-subtle opacity-30 cursor-not-allowed'
                            : isSelected
                            ? 'bg-[#1E88E5] text-white shadow-sm ring-2 ring-[#1E88E5]/25 font-bold cursor-pointer scale-105 z-10'
                            : isToday
                            ? 'border border-[#1E88E5] text-[#1E88E5] hover:bg-[#EFF6FF] cursor-pointer'
                            : 'text-ink hover:bg-[#EFF6FF] hover:text-[#1E88E5] cursor-pointer'
                        }`}
                      >
                        <span>{dayNum}</span>
                        {isSelected && (
                          <span className="text-[8px] leading-none opacity-85 font-mono">
                            P{postIndex + 1}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Quick Presets */}
                <div className="pt-2 border-t border-border-light flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium text-ink-muted mr-1">Presets:</span>
                    <button
                      type="button"
                      onClick={() => applyPreset('alternating')}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-surface border border-border-warm hover:border-[#1E88E5] hover:text-[#1E88E5] text-ink transition-colors cursor-pointer shadow-2xs"
                    >
                      Alternating Days
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('weekdays')}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-surface border border-border-warm hover:border-[#1E88E5] hover:text-[#1E88E5] text-ink transition-colors cursor-pointer shadow-2xs"
                    >
                      Weekdays
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('daily')}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-surface border border-border-warm hover:border-[#1E88E5] hover:text-[#1E88E5] text-ink transition-colors cursor-pointer shadow-2xs"
                    >
                      Daily
                    </button>
                  </div>
                  {selectedDates.length < selectedDayCount && (
                    <span className="text-[11px] text-blue-700 font-medium">
                      Select {selectedDayCount - selectedDates.length} more date(s)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Assurance Guarantee */}
        <div className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200/80 px-3.5 py-2 rounded-full text-xs text-emerald-800 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Unlimited free AI copy edits and custom image uploads included in every batch</span>
        </div>

        {/* Financial Transparency */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 flex flex-col gap-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 font-medium text-xs sm:text-sm">Cost to generate batch:</span>
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs sm:text-sm">
              <Coins className="w-4 h-4 text-brand fill-brand" />
              <span>{creditsNeeded} Credits</span>
              <span className="text-xs font-normal text-slate-500">(1 credit / post)</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-600 font-medium text-xs sm:text-sm">Your current balance:</span>
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs sm:text-sm">
              <span className="font-bold">{creditBalance} Credits</span>
              <span
                className={`text-xs ${
                  remainingCredits < 0 ? 'text-rose-600 font-semibold' : 'text-slate-500 font-normal'
                }`}
              >
                ({remainingCredits >= 0 ? `${remainingCredits} remaining` : 'Insufficient balance'})
              </span>
            </div>
          </div>
        </div>

        {!hasEnoughCredits && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl text-xs text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              You need {creditsNeeded} credits. Please buy more credits on the Credits page before proceeding.
            </span>
          </div>
        )}

        {/* Loading status during generation */}
        {isGenerating && (
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200/60 space-y-2 animate-fade-in">
            <div className="flex items-center gap-2 text-[#1E88E5] font-semibold text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{generationStep}</span>
            </div>
            <div className="w-full bg-white/60 h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#1E88E5] h-full rounded-full animate-pulse w-4/5" />
            </div>
          </div>
        )}

        {/* Actions Footer */}
        <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/batches/new')}
            disabled={isGenerating}
            className="w-full sm:w-auto px-4 py-2.5 text-sm font-semibold text-ink-muted hover:text-ink transition-colors text-center cursor-pointer"
          >
            ← Back to Brain Dump
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !hasEnoughCredits || selectedDates.length !== selectedDayCount}
            className="w-full sm:w-auto px-7 py-3 bg-[#1E88E5] hover:bg-[#1565C0] text-[#FFFFFF] font-semibold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating Posts...</span>
              </>
            ) : (
              <>
                <span>Generate {selectedDayCount} Polished Posts</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
