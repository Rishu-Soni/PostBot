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
} from 'lucide-react';
import { batchService } from '../../services/batchService';
import { useCredits } from '../../context/CreditsContext';
import { useToast } from '../../context/ToastContext';

const DAYS_OF_WEEK = [
  { id: 1, name: 'Mon' },
  { id: 2, name: 'Tue' },
  { id: 3, name: 'Wed' },
  { id: 4, name: 'Thu' },
  { id: 5, name: 'Fri' },
  { id: 6, name: 'Sat' },
  { id: 7, name: 'Sun' },
];

const CADENCE_SCHEDULES = {
  1: { label: 'Wednesday spotlight', activeDays: [3] },
  2: { label: 'Tuesday, Thursday', activeDays: [2, 4] },
  3: { label: 'Mon, Wed, Fri', activeDays: [1, 3, 5] },
  4: { label: 'Mon, Tue, Thu, Fri', activeDays: [1, 2, 4, 5] },
  5: { label: 'Mon, Tue, Wed, Thu, Fri', activeDays: [1, 2, 3, 4, 5] },
  6: { label: 'Mon through Sat', activeDays: [1, 2, 3, 4, 5, 6] },
  7: { label: 'Every Day (Mon - Sun)', activeDays: [1, 2, 3, 4, 5, 6, 7] },
};

export const DayCountRecommendPage = () => {
  const { batchId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { creditBalance, refreshBalance } = useCredits();
  const { showToast } = useToast();

  const initialRecommended = location.state?.recommendedDayCount || 5;
  const [recommendedDayCount, setRecommendedDayCount] = useState(initialRecommended);
  const [selectedDayCount, setSelectedDayCount] = useState(initialRecommended);
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
            setRecommendedDayCount(res.batch.recommendedDayCount);
            setSelectedDayCount(res.batch.finalDayCount || res.batch.recommendedDayCount);
          }
        })
        .catch((err) => {
          showToast(err.message || 'Failed to load batch recommendation.', 'error');
        });
    }
  }, [batchId, location.state, showToast]);

  const handleDecrement = () => {
    if (selectedDayCount > minDays) {
      setSelectedDayCount((prev) => prev - 1);
    }
  };

  const handleIncrement = () => {
    if (selectedDayCount < maxDays) {
      setSelectedDayCount((prev) => prev + 1);
    }
  };

  const handleGenerate = async () => {
    if (!hasEnoughCredits) {
      showToast(`Insufficient credits. You need ${creditsNeeded} credits, but have ${creditBalance}.`, 'error');
      return;
    }

    setIsGenerating(true);
    setGenerationStep('Allocating per-day editorial themes...');

    try {
      setTimeout(() => setGenerationStep('Generating high-converting post hooks and captions...'), 1400);
      setTimeout(() => setGenerationStep('Selecting matching visual imagery...'), 3000);

      const res = await batchService.updateDayCount(batchId, selectedDayCount);
      refreshBalance();
      showToast(`Successfully generated ${selectedDayCount} days of content!`, 'success');
      navigate(`/batches/${batchId}/review`, { state: { batch: res.batch, posts: res.posts } });
    } catch (err) {
      showToast(err.message || 'Post generation failed. Please retry.', 'error');
      setIsGenerating(false);
    }
  };

  const activeSchedule = CADENCE_SCHEDULES[selectedDayCount] || CADENCE_SCHEDULES[5];

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
          Based on the depth of your brain dump, here is the ideal weekly post cadence for maximum LinkedIn reach.
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
        <div className="flex flex-col gap-3">
          {/* Bound labels & title */}
          <div className="flex items-center justify-between text-xs font-semibold text-ink-muted px-1">
            <span>Min: {minDays} days</span>
            <span className="text-ink uppercase tracking-wider text-[11px] font-bold">
              Choose Your Schedule
            </span>
            <span>Max: {maxDays} days</span>
          </div>

          {/* Stepper Container */}
          <div className="bg-surface border border-border-warm rounded-xl p-4 flex items-center justify-between">
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

          {/* Visual Cadence Schedule Indicator */}
          <div className="mt-2 px-1">
            <div className="flex items-center justify-between text-[11px] font-medium text-ink-muted mb-1.5">
              <span>Active distribution preview:</span>
              <span className="text-brand font-semibold">{activeSchedule.label}</span>
            </div>

            {/* 7 Day Dot Indicator */}
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {DAYS_OF_WEEK.map((day) => {
                const isActive = activeSchedule.activeDays.includes(day.id);
                return (
                  <div
                    key={day.id}
                    className={`py-1 rounded text-[10px] font-bold transition-all ${
                      isActive
                        ? 'bg-brand text-white shadow-2xs'
                        : 'bg-stone-200/80 text-ink-subtle'
                    }`}
                  >
                    {day.name}
                  </div>
                );
              })}
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
            disabled={isGenerating || !hasEnoughCredits}
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
