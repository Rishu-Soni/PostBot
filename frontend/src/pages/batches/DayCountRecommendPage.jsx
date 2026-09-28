import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Sparkles,
  Minus,
  Plus,
  Coins,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  Calendar as CalendarIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { batchService } from '../../services/batchService';
import { useCredits } from '../../context/CreditsContext';
import { useToast } from '../../context/ToastContext';

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

export const DayCountRecommendPage = () => {
  const { batchId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { creditBalance, refreshBalance } = useCredits();
  const { showToast } = useToast();

  const initialRecommended = location.state?.recommendedDayCount || 5;
  const [recommendedDayCount, setRecommendedDayCount] = useState(initialRecommended);
  const [selectedDayCount, setSelectedDayCount] = useState(initialRecommended);
  const [selectedDates, setSelectedDates] = useState(() =>
    generatePresetDates(initialRecommended, 'alternating')
  );
  const [currentMonthDate, setCurrentMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState('');

  // Bounds: min 3 (or max 1, recommended - 2), max min(7, recommended + 2)
  const minDays = Math.max(1, Math.min(3, recommendedDayCount - 2));
  const maxDays = Math.min(7, Math.max(5, recommendedDayCount + 2));

  // Credit calculation
  const creditsNeeded = selectedDayCount;
  const hasEnoughCredits = creditBalance >= creditsNeeded;
  const remainingCredits = creditBalance - creditsNeeded;

  useEffect(() => {
    // If user refreshed or arrived directly without state, fetch the batch
    if (!location.state?.recommendedDayCount && batchId) {
      batchService
        .getBatchById(batchId)
        .then((res) => {
          if (res?.batch?.recommendedDayCount) {
            const rec = res.batch.recommendedDayCount;
            const finalCount = res.batch.finalDayCount || rec;
            setRecommendedDayCount(rec);
            setSelectedDayCount(finalCount);
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
        // If already at selectedDayCount, replace the last date
        const updated = [...selectedDates.slice(0, selectedDayCount - 1), dateKey].sort();
        setSelectedDates(updated);
      }
    }
  };

  const handleUpdateSinglePostDate = (index, newDateKey) => {
    if (!newDateKey) return;
    if (newDateKey < todayKey) {
      showToast('Cannot schedule posts in the past.', 'warning');
      return;
    }
    setSelectedDates((prev) => {
      const copy = [...prev];
      copy[index] = newDateKey;
      return copy.sort();
    });
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
    setGenerationStep('Allocating per-day editorial themes...');

    try {
      setTimeout(() => setGenerationStep('Generating high-converting post hooks and captions...'), 1400);
      setTimeout(() => setGenerationStep('Selecting matching visual imagery...'), 3000);

      const res = await batchService.updateDayCount(batchId, selectedDayCount, selectedDates);
      refreshBalance();
      showToast(`Successfully generated ${selectedDayCount} days of content!`, 'success');
      navigate(`/batches/${batchId}/review`, { state: { batch: res.batch, posts: res.posts } });
    } catch (err) {
      showToast(err.message || 'Post generation failed. Please retry.', 'error');
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-8 animate-fade-in py-6">
      {/* Header Eyebrow & Titles */}
      <div className="text-center space-y-3 flex flex-col items-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-soft border border-blue-100 text-xs font-semibold text-brand shadow-2xs">
          <Sparkles className="w-3.5 h-3.5 fill-brand" />
          <span>Content Capacity Analysis</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
          Day-Count Recommendation
        </h1>
        <p className="text-sm text-ink-muted max-w-md font-normal leading-relaxed">
          Based on the depth of your brain dump, choose your cadence and select any dates you want to schedule your posts.
        </p>
      </div>

      {/* Central Elevated Recommendation Card */}
      <div className="w-full bg-surface-card rounded-2xl border border-border-warm shadow-md p-6 sm:p-8 flex flex-col gap-6">
        {/* AI Recommendation Banner */}
        <div className="bg-brand-soft border border-blue-200/60 rounded-xl p-5 text-center flex flex-col items-center">
          <span className="text-[11px] font-bold tracking-wider text-brand uppercase bg-white/80 px-2.5 py-0.5 rounded border border-blue-100 mb-2">
            AI Recommendation
          </span>
          <p className="text-base sm:text-lg font-medium text-ink">
            We found enough substance for{' '}
            <span className="text-brand font-bold underline decoration-brand/30 underline-offset-4">
              {recommendedDayCount} days
            </span>{' '}
            of high-impact content.
          </p>
          <p className="text-xs text-ink-muted mt-1.5">
            You can adjust this between {minDays} to {maxDays} days to match your preferred frequency or budget.
          </p>
        </div>

        {/* Schedule Selector Controls */}
        <div className="flex flex-col gap-4">
          {/* Bound labels & title */}
          <div className="flex items-center justify-between text-xs font-semibold text-ink-muted px-1">
            <span>Min: {minDays} days</span>
            <span className="text-ink uppercase tracking-wider text-[11px] font-bold">
              Choose Your Schedule
            </span>
            <span>Max: {maxDays} days</span>
          </div>

          {/* Stepper Container */}
          <div className="bg-surface border border-border-warm rounded-xl p-4 flex items-center justify-between shadow-2xs">
            {/* Minus Button */}
            <button
              type="button"
              onClick={handleDecrement}
              disabled={selectedDayCount <= minDays || isGenerating}
              aria-label="Decrease days"
              className="w-12 h-12 rounded-xl bg-white border border-border-warm text-ink hover:border-brand hover:text-brand disabled:opacity-35 disabled:hover:border-border-warm disabled:hover:text-ink disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              <Minus className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* Central Count & Label */}
            <div className="flex flex-col items-center">
              <span className="text-4xl sm:text-5xl font-black text-ink tracking-tight leading-none">
                {selectedDayCount}
              </span>
              <span className="text-[11px] font-bold tracking-wider text-ink-muted uppercase mt-1">
                Days of Posts
              </span>
            </div>

            {/* Plus Button */}
            <button
              type="button"
              onClick={handleIncrement}
              disabled={selectedDayCount >= maxDays || isGenerating}
              aria-label="Increase days"
              className="w-12 h-12 rounded-xl bg-white border border-border-warm text-ink hover:border-brand hover:text-brand disabled:opacity-35 disabled:hover:border-border-warm disabled:hover:text-ink disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Interactive Date Selection Section */}
          <div className="space-y-3 pt-1">
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
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {selectedDates.length} of {selectedDayCount} dates selected
              </span>
            </div>

            <p className="text-xs text-ink-muted">
              Click any date on the calendar to customize your publishing schedule.
            </p>

            {/* Interactive Mini Calendar Box */}
            <div className="bg-white border border-border-warm rounded-2xl p-4 shadow-xs space-y-3">
              {/* Calendar Header: Month + Navigation */}
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

              {/* Weekday Headers */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAY_NAMES.map((name) => (
                  <div key={name} className="text-[11px] font-bold text-ink-muted py-0.5">
                    {name}
                  </div>
                ))}
              </div>

              {/* Calendar Grid Days */}
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
                          ? 'bg-brand text-white shadow-sm ring-2 ring-brand/25 font-bold cursor-pointer scale-105 z-10'
                          : isToday
                          ? 'border border-brand text-brand hover:bg-brand-soft cursor-pointer'
                          : 'text-ink hover:bg-brand-soft/60 hover:text-brand cursor-pointer'
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

              {/* Quick Preset Buttons */}
              <div className="pt-2 border-t border-border-light flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-ink-muted mr-1">Quick Presets:</span>
                <button
                  type="button"
                  onClick={() => applyPreset('alternating')}
                  className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-surface border border-border-warm hover:border-brand hover:text-brand text-ink transition-colors cursor-pointer shadow-2xs"
                >
                  Alternating Days
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('weekdays')}
                  className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-surface border border-border-warm hover:border-brand hover:text-brand text-ink transition-colors cursor-pointer shadow-2xs"
                >
                  Consecutive Weekdays
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('daily')}
                  className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-surface border border-border-warm hover:border-brand hover:text-brand text-ink transition-colors cursor-pointer shadow-2xs"
                >
                  Daily
                </button>
              </div>
            </div>

            {/* Configured Dates List */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-ink">Configured Post Dates</span>
                {selectedDates.length < selectedDayCount && (
                  <span className="text-[11px] text-amber-700 font-medium">
                    Select {selectedDayCount - selectedDates.length} more date(s) on the calendar
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-0.5">
                {selectedDates.map((dateStr, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 bg-surface border border-border-warm rounded-xl text-xs hover:border-brand/40 transition-colors shadow-2xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-brand text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-ink truncate">
                        {formatReadableDate(dateStr)}
                      </span>
                    </div>
                    <input
                      type="date"
                      value={dateStr}
                      min={todayKey}
                      onChange={(e) => handleUpdateSinglePostDate(idx, e.target.value)}
                      className="text-[11px] text-ink bg-white border border-border-warm rounded-lg px-2 py-1 focus:ring-1 focus:ring-brand focus:border-brand cursor-pointer shadow-2xs font-medium shrink-0"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Financial / Credit Transparency Box */}
        <div className="pt-4 border-t border-border-light flex flex-col gap-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-muted font-medium">Cost to generate batch:</span>
            <div className="flex items-center gap-1.5 font-bold text-ink">
              <Coins className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span>{creditsNeeded} Credits</span>
              <span className="text-xs font-normal text-ink-muted">(1 credit / post)</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-ink-muted font-medium">Your current balance:</span>
            <div className="flex items-center gap-1.5 font-semibold text-ink">
              <span className="font-bold">{creditBalance} Credits</span>
              <span
                className={`text-xs font-normal ${
                  remainingCredits < 0 ? 'text-rose-600 font-semibold' : 'text-ink-muted'
                }`}
              >
                ({remainingCredits >= 0 ? `${remainingCredits} remaining` : 'Insufficient balance'})
              </span>
            </div>
          </div>

          {!hasEnoughCredits && (
            <div className="mt-1 flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                You need {creditsNeeded} credits. Please buy more credits on the Credits page before proceeding.
              </span>
            </div>
          )}

          {/* Assurance Guarantee Notice */}
          <div className="mt-1 flex items-center gap-2 bg-surface border border-border-warm px-3 py-2 rounded-lg text-xs text-emerald-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Unlimited free AI copy edits and image uploads included in every batch.</span>
          </div>
        </div>

        {/* Loading status during generation */}
        {isGenerating && (
          <div className="p-4 rounded-xl bg-brand-soft border border-brand/20 space-y-2 animate-fade-in">
            <div className="flex items-center gap-2 text-brand font-semibold text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{generationStep}</span>
            </div>
            <div className="w-full bg-white/60 h-1.5 rounded-full overflow-hidden">
              <div className="bg-brand h-full rounded-full animate-pulse w-4/5" />
            </div>
          </div>
        )}

        {/* Actions Footer Buttons */}
        <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
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
            className="w-full sm:w-auto px-6 py-2.5 bg-coral hover:bg-coral-hover text-white font-semibold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating Posts...</span>
              </>
            ) : (
              <>
                <span>Generate My Posts</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
