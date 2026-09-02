import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import {
  ArrowLeft,
  Compass,
  Calendar,
  Clock,
  AlertCircle,
  Hash,
  Sparkles,
  Check,
  Copy,
  Pencil,
  Lock,
  Save,
  X,
  RefreshCw,
  Plus,
  Code2,
  ChevronDown,
  ChevronUp,
  Sliders,
  CheckCircle2,
  CalendarDays,
  FileText,
  Lightbulb,
  Eye,
  Image as ImageIcon,
  ExternalLink,
  Download,
  ThumbsUp,
  MessageSquare,
  Repeat2,
  Send,
  Globe,
  Share2,
  Layers,
} from 'lucide-react';


/**
 * Format helper for dates
 */
const formatDate = (dateString) => {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
};

/**
 * Format ISO date string to YYYY-MM-DD for input[type=date]
 */
const toInputDateString = (date) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }
  return d.toISOString().split('T')[0];
};

/**
 * Generate 7 days initialized starting from a specific dayNumber and startDate
 */
const generate7DaysInitial = (startDay = 1, baseDate = new Date()) => {
  const rows = [];
  const start = new Date(baseDate);
  if (isNaN(start.getTime())) {
    start.setTime(Date.now());
  }

  for (let i = 0; i < 7; i++) {
    const rowDate = new Date(start);
    rowDate.setDate(start.getDate() + i);

    rows.push({
      dayNumber: startDay + i,
      scheduledDate: toInputDateString(rowDate),
      topic: '',
      challenge: '',
      extraNotes: '',
    });
  }
  return rows;
};

export const JourneyDetailPage = () => {
  const { id } = useParams();
  const { token } = useAuth();

  // Journey state
  const [journey, setJourney] = useState(null);
  const [loadingJourney, setLoadingJourney] = useState(true);
  const [journeyError, setJourneyError] = useState('');

  // Entries list state
  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [entriesError, setEntriesError] = useState('');

  // 7-day planning form state
  const [planRows, setPlanRows] = useState(() => generate7DaysInitial(1, new Date()));
  const [startDayInput, setStartDayInput] = useState(1);
  const [startDateInput, setStartDateInput] = useState(() => toInputDateString(new Date()));
  const [submittingPlan, setSubmittingPlan] = useState(false);
  const [planSuccessMsg, setPlanSuccessMsg] = useState('');
  const [planErrorMsg, setPlanErrorMsg] = useState('');
  const [showPlanner, setShowPlanner] = useState(true);

  // Inline editing state
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    topic: '',
    challenge: '',
    extraNotes: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Status testing / switcher state
  const [updatingStatusId, setUpdatingStatusId] = useState(null);

  // Raw JSON accordion state
  const [showRawJson, setShowRawJson] = useState(false);
  const [copied, setCopied] = useState(false);

  // Filter state for entries
  const [statusFilter, setStatusFilter] = useState('all');

  // Text & Image generation & post preview state
  const [generatingTextId, setGeneratingTextId] = useState(null);
  const [generatingImageId, setGeneratingImageId] = useState(null);
  const [viewingPostEntry, setViewingPostEntry] = useState(null);
  const [copiedPostText, setCopiedPostText] = useState(false);
  const [copiedImageUrl, setCopiedImageUrl] = useState(false);
  const [selectedPreviewEntryId, setSelectedPreviewEntryId] = useState(null);

  // Entries that have both generatedText and generatedImageUrl (fully assembled posts)
  const assembledEntries = useMemo(() => {
    return entries.filter((e) => Boolean(e.generatedText) && Boolean(e.generatedImageUrl));
  }, [entries]);

  // Current active entry for the assembled preview card
  const activeAssembledEntry = useMemo(() => {
    if (selectedPreviewEntryId) {
      const found = entries.find((e) => (e._id || e.id) === selectedPreviewEntryId);
      if (found && found.generatedText && found.generatedImageUrl) {
        return found;
      }
    }
    return assembledEntries.length > 0 ? assembledEntries[assembledEntries.length - 1] : null;
  }, [entries, selectedPreviewEntryId, assembledEntries]);


  // Fetch Journey Details
  const fetchJourney = async () => {
    if (!token || !id) return;
    setLoadingJourney(true);
    setJourneyError('');
    try {
      const response = await fetch(`/api/journeys/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (response.ok && data.journey) {
        setJourney(data.journey);
      } else {
        setJourneyError(data.error || 'Journey not found');
      }
    } catch (err) {
      console.error('Error fetching journey:', err);
      setJourneyError('Failed to load journey details');
    } finally {
      setLoadingJourney(false);
    }
  };

  // Fetch Journey Entries
  const fetchEntries = async () => {
    if (!token || !id) return;
    setLoadingEntries(true);
    setEntriesError('');
    try {
      const response = await fetch(`/api/journeys/${id}/entries`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setEntries(data.entries || []);
      } else {
        setEntriesError(data.error || 'Failed to load daily entries');
      }
    } catch (err) {
      console.error('Error fetching entries:', err);
      setEntriesError('Failed to load entries');
    } finally {
      setLoadingEntries(false);
    }
  };

  useEffect(() => {
    fetchJourney();
    fetchEntries();
  }, [id, token]);

  // Recalculate default start day and dates when entries or journey load
  useEffect(() => {
    if (entries.length > 0) {
      const maxDay = Math.max(...entries.map((e) => e.dayNumber), 0);
      const nextDay = maxDay + 1;
      setStartDayInput(nextDay);

      // Find highest scheduledDate or use today
      const lastEntry = entries[entries.length - 1];
      let nextDate = new Date();
      if (lastEntry && lastEntry.scheduledDate) {
        const lastD = new Date(lastEntry.scheduledDate);
        if (!isNaN(lastD.getTime())) {
          nextDate = new Date(lastD);
          nextDate.setDate(lastD.getDate() + 1);
        }
      }
      const formattedDate = toInputDateString(nextDate);
      setStartDateInput(formattedDate);
      setPlanRows(generate7DaysInitial(nextDay, nextDate));
    } else if (journey?.startDate) {
      const startD = new Date(journey.startDate);
      setStartDayInput(1);
      setStartDateInput(toInputDateString(startD));
      setPlanRows(generate7DaysInitial(1, startD));
    }
  }, [entries.length, journey?.startDate]);

  // Apply Start Day / Start Date changes to the 7 rows
  const handleApplyStartSettings = (newStartDay, newStartDateStr) => {
    const sDay = Number(newStartDay) || 1;
    const baseDate = new Date(newStartDateStr);
    setStartDayInput(sDay);
    setStartDateInput(newStartDateStr);
    setPlanRows((prev) => {
      return prev.map((row, idx) => {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() + idx);
        return {
          ...row,
          dayNumber: sDay + idx,
          scheduledDate: toInputDateString(d),
        };
      });
    });
  };

  // Update a single row in the 7-day planner
  const handlePlanRowChange = (index, field, value) => {
    setPlanRows((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        [field]: value,
      };
      return copy;
    });
  };

  // Fill sample topics for quick testing / guidance
  const handleFillSampleTopics = () => {
    const samples = [
      {
        topic: 'Core Architectural Concepts & Foundation',
        challenge: 'Structuring modular layers cleanly',
        extraNotes: 'Highlight state boundaries and patterns',
      },
      {
        topic: 'Data Flow & State Management Best Practices',
        challenge: 'Preventing race conditions & async lag',
        extraNotes: 'Add code snippet with tip',
      },
      {
        topic: 'Performance Optimization & Benchmarking',
        challenge: 'Bottlenecks in nested loops',
        extraNotes: 'Include before/after metrics table',
      },
      {
        topic: 'Error Handling & Resilient Recovery',
        challenge: 'Graceful fallbacks for network drops',
        extraNotes: 'Mention retry with exponential backoff',
      },
      {
        topic: 'Security, Encryption & Token Safety',
        challenge: 'Protecting secrets at rest',
        extraNotes: 'Explain AES-256-GCM token storage',
      },
      {
        topic: 'Automated Testing & Integration Suites',
        challenge: 'Mocking external third-party APIs',
        extraNotes: 'Share test runner output screenshot',
      },
      {
        topic: 'Weekly Retrospective & Key Takeaways',
        challenge: 'Synthesizing learnings into action items',
        extraNotes: 'Call to action: ask audience for their thoughts',
      },
    ];

    setPlanRows((prev) =>
      prev.map((row, idx) => ({
        ...row,
        topic: samples[idx]?.topic || `Day ${row.dayNumber} Deep Dive`,
        challenge: samples[idx]?.challenge || 'Key technical hurdle',
        extraNotes: samples[idx]?.extraNotes || 'Notes for content generator',
      }))
    );
  };

  // Submit 7-day bulk plan
  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    setPlanErrorMsg('');
    setPlanSuccessMsg('');

    // Quick client-side check
    for (let i = 0; i < planRows.length; i++) {
      const row = planRows[i];
      if (!row.scheduledDate) {
        setPlanErrorMsg(`Please provide a scheduled date for Day ${row.dayNumber}.`);
        return;
      }
    }

    setSubmittingPlan(true);
    try {
      const response = await fetch(`/api/journeys/${id}/entries/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(planRows),
      });

      const data = await response.json();

      if (response.ok) {
        setPlanSuccessMsg(
          `Successfully planned ${data.entries?.length || 7} days (Days ${planRows[0].dayNumber} - ${
            planRows[planRows.length - 1].dayNumber
          })!`
        );
        // Refresh entries list
        await fetchEntries();

        // Prepare next week's initial rows
        const nextStartDay = Number(planRows[planRows.length - 1].dayNumber) + 1;
        const lastDate = new Date(planRows[planRows.length - 1].scheduledDate);
        lastDate.setDate(lastDate.getDate() + 1);
        const nextDateStr = toInputDateString(lastDate);

        setStartDayInput(nextStartDay);
        setStartDateInput(nextDateStr);
        setPlanRows(generate7DaysInitial(nextStartDay, lastDate));
      } else {
        setPlanErrorMsg(data.error || 'Failed to submit bulk plan');
      }
    } catch (err) {
      console.error('Bulk submission error:', err);
      setPlanErrorMsg('Network error submitting 7-day plan. Please try again.');
    } finally {
      setSubmittingPlan(false);
    }
  };

  // Start inline editing an entry
  const handleStartEdit = (entry) => {
    if (entry.status === 'posted') return; // Enforce UI disabling
    setEditingEntryId(entry._id || entry.id);
    setEditFormData({
      topic: entry.topic || '',
      challenge: entry.challenge || '',
      extraNotes: entry.extraNotes || '',
    });
    setEditError('');
  };

  // Cancel inline edit
  const handleCancelEdit = () => {
    setEditingEntryId(null);
    setEditFormData({ topic: '', challenge: '', extraNotes: '' });
    setEditError('');
  };

  // Save inline edit via PATCH /api/journeys/:journeyId/entries/:entryId
  const handleSaveEdit = async (entryId) => {
    setSavingEdit(true);
    setEditError('');
    try {
      const response = await fetch(`/api/journeys/${id}/entries/${entryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editFormData),
      });

      const data = await response.json();

      if (response.ok && data.entry) {
        setEntries((prev) =>
          prev.map((e) => ((e._id || e.id) === entryId ? { ...e, ...data.entry } : e))
        );
        setEditingEntryId(null);
      } else {
        setEditError(data.error || 'Failed to update entry');
      }
    } catch (err) {
      console.error('Edit error:', err);
      setEditError('Network error updating entry');
    } finally {
      setSavingEdit(false);
    }
  };

  // Helper status changer for testing (e.g. test setting status to 'posted' or 'planned')
  const handleStatusChangeTest = async (entryId, newStatus) => {
    setUpdatingStatusId(entryId);
    try {
      const response = await fetch(`/api/journeys/${id}/entries/${entryId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();
      if (response.ok && data.entry) {
        setEntries((prev) =>
          prev.map((e) => ((e._id || e.id) === entryId ? { ...e, status: data.entry.status } : e))
        );
        // If the entry was currently open in inline edit and became posted, close edit
        if (editingEntryId === entryId && newStatus === 'posted') {
          setEditingEntryId(null);
        }
      } else {
        alert(data.error || 'Failed to update status');
      }
    } catch (err) {
      console.error('Status test update error:', err);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // Trigger LLM text generation via POST /api/journeys/:journeyId/entries/:entryId/generate-text
  const handleGeneratePost = async (entryId) => {
    setGeneratingTextId(entryId);
    try {
      const response = await fetch(`/api/journeys/${id}/entries/${entryId}/generate-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (response.ok && data.entry) {
        setEntries((prev) =>
          prev.map((e) => ((e._id || e.id) === entryId ? { ...e, ...data.entry } : e))
        );
        setSelectedPreviewEntryId(entryId);
        // Also update modal state if open
        if (viewingPostEntry && (viewingPostEntry._id || viewingPostEntry.id) === entryId) {
          setViewingPostEntry(data.entry);
        }
      } else {
        alert(data.error || 'Failed to generate post text');
      }
    } catch (err) {
      console.error('Generate post error:', err);
      alert('Network error while generating post text');
    } finally {
      setGeneratingTextId(null);
    }
  };

  // Trigger AI image generation via POST /api/journeys/:journeyId/entries/:entryId/generate-image
  const handleGenerateImage = async (entryId) => {
    setGeneratingImageId(entryId);
    try {
      const response = await fetch(`/api/journeys/${id}/entries/${entryId}/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (response.ok && data.entry) {
        setEntries((prev) =>
          prev.map((e) => ((e._id || e.id) === entryId ? { ...e, ...data.entry } : e))
        );
        setSelectedPreviewEntryId(entryId);
        // Also update modal state if open
        if (viewingPostEntry && (viewingPostEntry._id || viewingPostEntry.id) === entryId) {
          setViewingPostEntry(data.entry);
        }
      } else {
        alert(data.error || 'Failed to generate post image');
      }
    } catch (err) {
      console.error('Generate image error:', err);
      alert('Network error while generating post image');
    } finally {
      setGeneratingImageId(null);
    }
  };

  // Copy generated post text
  const handleCopyPostText = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedPostText(true);
    setTimeout(() => setCopiedPostText(false), 2000);
  };

  // Copy image URL
  const handleCopyImageUrl = (url) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedImageUrl(true);
    setTimeout(() => setCopiedImageUrl(false), 2000);
  };


  // Copy raw JSON
  const handleCopyJSON = () => {
    if (!journey) return;
    const payload = {
      journey,
      entries,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filtered entries
  const filteredEntries = useMemo(() => {
    if (statusFilter === 'all') return entries;
    return entries.filter((e) => e.status === statusFilter);
  }, [entries, statusFilter]);

  // Status badges helper
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'planned':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            Planned
          </span>
        );
      case 'generated':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Sparkles className="w-3 h-3 text-purple-400" />
            Generated
          </span>
        );
      case 'posted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm shadow-emerald-500/10">
            <Check className="w-3 h-3 text-emerald-400" />
            Posted
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <AlertCircle className="w-3 h-3 text-red-400" />
            Failed
          </span>
        );
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Skipped
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  // Stats computation
  const stats = useMemo(() => {
    const planned = entries.filter((e) => e.status === 'planned').length;
    const generated = entries.filter((e) => e.status === 'generated').length;
    const posted = entries.filter((e) => e.status === 'posted').length;
    const total = entries.length;
    return { planned, generated, posted, total };
  }, [entries]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        {/* Navigation & Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            to="/journeys"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-indigo-400 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Journeys</span>
          </Link>

          {journey && (
            <div className="flex items-center gap-2.5">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                  journey.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : journey.status === 'paused'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    journey.status === 'active'
                      ? 'bg-emerald-400 animate-pulse'
                      : journey.status === 'paused'
                      ? 'bg-amber-400'
                      : 'bg-indigo-400'
                  }`}
                />
                {journey.status ? journey.status.toUpperCase() : 'ACTIVE'}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-900 text-indigo-300 border border-slate-800">
                Day {journey.currentDay ?? 0}
              </span>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loadingJourney && (
          <div className="p-16 text-center bg-slate-900/50 border border-slate-800 rounded-3xl backdrop-blur-md">
            <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium text-slate-400">Loading journey & entries...</p>
          </div>
        )}

        {/* Journey Error */}
        {!loadingJourney && journeyError && (
          <div className="p-8 rounded-3xl bg-red-950/40 border border-red-500/30 text-center space-y-4 max-w-xl mx-auto">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">Journey Not Found</h2>
            <p className="text-sm text-red-200">{journeyError}</p>
            <Link
              to="/journeys"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-colors"
            >
              Return to Journeys List
            </Link>
          </div>
        )}

        {/* Main Content View */}
        {!loadingJourney && !journeyError && journey && (
          <>
            {/* Header Hero Card */}
            <div className="relative rounded-3xl bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-950/90 border border-slate-800/80 p-6 sm:p-8 backdrop-blur-md shadow-2xl overflow-hidden">
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
                    <Compass className="w-3.5 h-3.5" />
                    <span>Cadence Journey</span>
                  </div>

                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight">
                    {journey.title}
                  </h1>

                  <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-400 pt-1">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <Clock className="w-4 h-4 text-indigo-400" />
                      Posting at <strong className="text-white">{journey.postTimeLocal || '09:00'}</strong> daily
                    </span>

                    {journey.startDate && (
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <Calendar className="w-4 h-4 text-indigo-400" />
                        Started: <strong className="text-white">{formatDate(journey.startDate)}</strong>
                      </span>
                    )}

                    {journey.imageStyle && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-300 text-xs font-mono">
                        Style: {journey.imageStyle}
                      </span>
                    )}
                  </div>

                  {/* Hashtags */}
                  {Array.isArray(journey.hashtags) && journey.hashtags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {journey.hashtags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-0.5 text-xs font-mono text-indigo-300 bg-indigo-500/10 px-2.5 py-0.5 rounded-lg border border-indigo-500/20"
                        >
                          <Hash className="w-3 h-3" />
                          {tag.replace(/^#/, '')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4 shrink-0">
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center">
                    <p className="text-xs text-slate-400 font-medium">Total Days</p>
                    <p className="text-2xl font-black text-white mt-1">{stats.total}</p>
                  </div>
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-sky-950/30 border border-sky-500/20 text-center">
                    <p className="text-xs text-sky-300 font-medium">Planned</p>
                    <p className="text-2xl font-black text-sky-400 mt-1">{stats.planned}</p>
                  </div>
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-purple-950/30 border border-purple-500/20 text-center">
                    <p className="text-xs text-purple-300 font-medium">Generated</p>
                    <p className="text-2xl font-black text-purple-400 mt-1">{stats.generated}</p>
                  </div>
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 text-center">
                    <p className="text-xs text-emerald-300 font-medium">Posted</p>
                    <p className="text-2xl font-black text-emerald-400 mt-1">{stats.posted}</p>
                  </div>
                </div>
              </div>

              {/* Template Drawer snippet */}
              <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="font-semibold text-slate-300">Prompt Template:</span>
                  <span className="font-mono text-indigo-200 bg-slate-950/80 px-2.5 py-1 rounded-md border border-slate-800 truncate max-w-md">
                    {journey.template}
                  </span>
                </div>

                <button
                  onClick={() => setShowPlanner(!showPlanner)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showPlanner ? 'Hide 7-Day Planner' : 'Plan Next 7 Days'}</span>
                  {showPlanner ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* 7-DAY BATCH PLANNER FORM */}
            {/* ------------------------------------------------------------- */}
            {showPlanner && (
              <section className="rounded-3xl bg-slate-900/80 border border-slate-800 p-6 sm:p-8 backdrop-blur-md shadow-xl transition-all">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
                      <CalendarDays className="w-3.5 h-3.5" />
                      <span>Bulk Content Planner</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                      Plan This Week (7 Days)
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                      Batch plan topics, daily challenges, and notes for the next 7 posting days.
                    </p>
                  </div>

                  {/* Form Quick Controls */}
                  <div className="flex flex-wrap items-center gap-3 bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400 font-medium">Start Day:</span>
                      <input
                        type="number"
                        min="1"
                        value={startDayInput}
                        onChange={(e) => handleApplyStartSettings(e.target.value, startDateInput)}
                        className="w-16 px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-center focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400 font-medium">Start Date:</span>
                      <input
                        type="date"
                        value={startDateInput}
                        onChange={(e) => handleApplyStartSettings(startDayInput, e.target.value)}
                        className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleFillSampleTopics}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/20 transition-colors"
                      title="Auto-fill sample topics & challenges"
                    >
                      <Lightbulb className="w-3 h-3 text-indigo-400" />
                      <span>Sample Ideas</span>
                    </button>
                  </div>
                </div>

                {/* Plan Alerts */}
                {planSuccessMsg && (
                  <div className="mt-6 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between gap-3 text-emerald-200 text-sm">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <span>{planSuccessMsg}</span>
                    </div>
                    <button
                      onClick={() => setPlanSuccessMsg('')}
                      className="text-xs text-emerald-300 hover:text-white"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {planErrorMsg && (
                  <div className="mt-6 p-4 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-center justify-between gap-3 text-red-200 text-sm">
                    <div className="flex items-center gap-2.5">
                      <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                      <span>{planErrorMsg}</span>
                    </div>
                    <button
                      onClick={() => setPlanErrorMsg('')}
                      className="text-xs text-red-300 hover:text-white"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* 7-Row Form */}
                <form onSubmit={handleBulkSubmit} className="mt-6 space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                          <th className="pb-3 px-3 w-24">Day #</th>
                          <th className="pb-3 px-3 w-40">Scheduled Date</th>
                          <th className="pb-3 px-3">Topic / Theme</th>
                          <th className="pb-3 px-3">Daily Challenge / Focus</th>
                          <th className="pb-3 px-3">Extra Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {planRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-950/40 transition-colors">
                            {/* Day Number */}
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-indigo-300 font-mono text-xs font-bold shadow-inner">
                                Day {row.dayNumber}
                              </span>
                            </td>

                            {/* Scheduled Date */}
                            <td className="py-2.5 px-3">
                              <input
                                type="date"
                                required
                                value={row.scheduledDate}
                                onChange={(e) => handlePlanRowChange(idx, 'scheduledDate', e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                              />
                            </td>

                            {/* Topic */}
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                placeholder={`e.g. Day ${row.dayNumber} core concept`}
                                value={row.topic}
                                onChange={(e) => handlePlanRowChange(idx, 'topic', e.target.value)}
                                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                              />
                            </td>

                            {/* Challenge */}
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                placeholder="e.g. Overcoming roadblock"
                                value={row.challenge}
                                onChange={(e) => handlePlanRowChange(idx, 'challenge', e.target.value)}
                                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                              />
                            </td>

                            {/* Extra Notes */}
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                placeholder="e.g. Include code snippet"
                                value={row.extraNotes}
                                onChange={(e) => handlePlanRowChange(idx, 'extraNotes', e.target.value)}
                                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Submit Action Bar */}
                  <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800">
                    <p className="text-xs text-slate-400">
                      Submitting will create 7 entries with status <span className="font-semibold text-sky-400">"planned"</span>.
                    </p>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() =>
                          setPlanRows(generate7DaysInitial(startDayInput, new Date(startDateInput)))
                        }
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                      >
                        Reset Rows
                      </button>

                      <button
                        type="submit"
                        disabled={submittingPlan}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-indigo-500/25 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submittingPlan ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Creating 7 Entries...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            <span>Save 7-Day Plan</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </section>
            )}

            {/* ------------------------------------------------------------- */}
            {/* ASSEMBLED POST LIVE PREVIEW CARD (IMAGE + TEXT) */}
            {/* ------------------------------------------------------------- */}
            {activeAssembledEntry && (
              <section className="relative rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border-2 border-indigo-500/30 p-6 sm:p-8 backdrop-blur-xl shadow-2xl shadow-indigo-950/40 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="absolute top-0 right-0 -mr-24 -mt-24 w-80 h-80 bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

                {/* Preview Card Header */}
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold tracking-wide uppercase">
                        <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                        <span>Assembled Post Live Preview</span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-950 text-indigo-300 border border-slate-800 text-xs font-mono font-bold">
                        Day {activeAssembledEntry.dayNumber}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        &bull; {formatDate(activeAssembledEntry.scheduledDate)}
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                      {activeAssembledEntry.topic || `Day ${activeAssembledEntry.dayNumber} Update`}
                    </h2>
                  </div>

                  {/* Tabs / Selector for all assembled entries */}
                  {assembledEntries.length > 1 && (
                    <div className="flex items-center gap-1.5 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 self-start md:self-auto overflow-x-auto max-w-full">
                      <span className="text-[11px] font-semibold text-slate-400 px-2 uppercase tracking-wider">
                        Switch Day:
                      </span>
                      {assembledEntries.map((item) => {
                        const itemId = item._id || item.id;
                        const isSelected = (activeAssembledEntry._id || activeAssembledEntry.id) === itemId;
                        return (
                          <button
                            key={itemId}
                            onClick={() => setSelectedPreviewEntryId(itemId)}
                            className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all ${
                              isSelected
                                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                            }`}
                          >
                            Day {item.dayNumber}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Assembled Post Content Layout (2-Column Grid on Large Screens) */}
                <div className="relative z-10 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Column 1: LinkedIn Live Mockup (7 cols) */}
                  <div className="lg:col-span-7 bg-slate-950 rounded-2xl border border-slate-800 p-5 sm:p-6 shadow-inner space-y-4 flex flex-col justify-between">
                    <div className="space-y-4">
                      {/* Creator Profile Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-sky-500 p-0.5 shadow-md">
                            <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center font-bold text-white text-sm">
                              YOU
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white flex items-center gap-1.5">
                              <span>Your LinkedIn Name</span>
                              <span className="text-[11px] font-normal text-slate-400">&bull; 1st</span>
                            </div>
                            <div className="text-[11px] text-slate-400">Building in public 🚀 &bull; Solopreneur Journey</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>Scheduled for {formatDate(activeAssembledEntry.scheduledDate)} at {journey.postTimeLocal || '09:00'}</span>
                              <span>&bull;</span>
                              <Globe className="w-3 h-3 text-slate-400" />
                            </div>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Ready to Post
                        </span>
                      </div>

                      {/* Post Text */}
                      <div className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap font-sans select-text">
                        {activeAssembledEntry.generatedText}
                      </div>
                    </div>

                    {/* LinkedIn Interaction Mockup Bar */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-slate-400 text-xs">
                      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-900 text-slate-300 hover:text-indigo-400 transition-colors">
                        <ThumbsUp className="w-4 h-4 text-indigo-400" />
                        <span className="font-semibold">Like</span>
                      </button>
                      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-900 text-slate-300 hover:text-indigo-400 transition-colors">
                        <MessageSquare className="w-4 h-4 text-sky-400" />
                        <span className="font-semibold">Comment</span>
                      </button>
                      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-900 text-slate-300 hover:text-indigo-400 transition-colors">
                        <Repeat2 className="w-4 h-4 text-purple-400" />
                        <span className="font-semibold">Repost</span>
                      </button>
                      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-900 text-slate-300 hover:text-indigo-400 transition-colors">
                        <Send className="w-4 h-4 text-slate-400" />
                        <span className="font-semibold">Send</span>
                      </button>
                    </div>
                  </div>

                  {/* Column 2: Generated Image & Asset Control (5 cols) */}
                  <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
                    {/* Image Container with Hover Controls */}
                    <div className="relative group rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-xl aspect-square flex items-center justify-center">
                      <img
                        src={activeAssembledEntry.generatedImageUrl}
                        alt={`Day ${activeAssembledEntry.dayNumber} visual`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-4">
                        <div className="flex justify-end gap-2">
                          <a
                            href={activeAssembledEntry.generatedImageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-xl bg-slate-900/90 hover:bg-indigo-600 text-white text-xs font-semibold shadow-lg backdrop-blur-md transition-all flex items-center gap-1.5"
                            title="Open image in new tab"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span>Full Res</span>
                          </a>
                        </div>

                        <div className="text-left space-y-1">
                          <span className="text-[10px] uppercase font-mono tracking-wider text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-500/30">
                            Visual Style: {journey.imageStyle || 'Modern 3D Minimalist'}
                          </span>
                          <p className="text-xs text-white font-medium line-clamp-1">
                            {activeAssembledEntry.topic}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Action Controls & Utilities for Assembled Post */}
                    <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{activeAssembledEntry.generatedText.length} / 1300 chars</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Text + Image Ready</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleCopyPostText(activeAssembledEntry.generatedText)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all active:scale-95"
                        >
                          {copiedPostText ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Text Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Copy Text</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleCopyImageUrl(activeAssembledEntry.generatedImageUrl)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all active:scale-95"
                        >
                          {copiedImageUrl ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">URL Copied!</span>
                            </>
                          ) : (
                            <>
                              <ImageIcon className="w-3.5 h-3.5 text-pink-400" />
                              <span>Copy Image URL</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                        <button
                          onClick={() => handleGeneratePost(activeAssembledEntry._id || activeAssembledEntry.id)}
                          disabled={generatingTextId === (activeAssembledEntry._id || activeAssembledEntry.id)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/20 transition-all disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              generatingTextId === (activeAssembledEntry._id || activeAssembledEntry.id)
                                ? 'animate-spin'
                                : ''
                            }`}
                          />
                          <span>Regen Text</span>
                        </button>

                        <button
                          onClick={() => handleGenerateImage(activeAssembledEntry._id || activeAssembledEntry.id)}
                          disabled={generatingImageId === (activeAssembledEntry._id || activeAssembledEntry.id)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 text-xs font-semibold border border-pink-500/20 transition-all disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              generatingImageId === (activeAssembledEntry._id || activeAssembledEntry.id)
                                ? 'animate-spin'
                                : ''
                            }`}
                          />
                          <span>Regen Image</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ------------------------------------------------------------- */}
            {/* ENTRIES LIST & TABLE WITH INLINE EDITING */}
            {/* ------------------------------------------------------------- */}
            <section className="space-y-4">
              {/* Section Header & Filter Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
                    <span>Journey Schedule</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {entries.length} entries
                    </span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                    Generate text & visual artwork for each daily post. Once both exist, view the assembled post live above.
                  </p>
                </div>

                {/* Filter Tabs & Refresh */}
                <div className="flex items-center gap-2">
                  <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium">
                    {['all', 'planned', 'generated', 'posted'].map((filterKey) => (
                      <button
                        key={filterKey}
                        onClick={() => setStatusFilter(filterKey)}
                        className={`px-3 py-1 rounded-lg capitalize transition-colors ${
                          statusFilter === filterKey
                            ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {filterKey}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={fetchEntries}
                    disabled={loadingEntries}
                    className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl transition-colors"
                    title="Refresh entries"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingEntries ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Entries Fetch Error */}
              {entriesError && (
                <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/30 text-red-200 text-sm flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <span>{entriesError}</span>
                </div>
              )}

              {/* Inline Edit Error Alert */}
              {editError && (
                <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/30 text-red-200 text-sm flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                    <span>{editError}</span>
                  </div>
                  <button onClick={() => setEditError('')} className="text-xs text-red-300 hover:text-white">
                    Dismiss
                  </button>
                </div>
              )}

              {/* Empty Entries State */}
              {!loadingEntries && entries.length === 0 && (
                <div className="text-center py-16 px-4 rounded-3xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm">
                  <CalendarDays className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-white">No Daily Entries Yet</h3>
                  <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mt-1 mb-5">
                    Use the "Plan This Week" form above to create your first 7 days of scheduled content.
                  </p>
                  <button
                    onClick={() => {
                      setShowPlanner(true);
                      window.scrollTo({ top: 200, behavior: 'smooth' });
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Open 7-Day Planner</span>
                  </button>
                </div>
              )}

              {/* Entries Table */}
              {entries.length > 0 && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[860px]">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                          <th className="py-3.5 px-4 w-28">Day #</th>
                          <th className="py-3.5 px-4 w-36">Date</th>
                          <th className="py-3.5 px-4">Topic / Focus</th>
                          <th className="py-3.5 px-4">Challenge & Notes</th>
                          <th className="py-3.5 px-4 w-28 text-center">Status</th>
                          <th className="py-3.5 px-4 w-72 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-xs">
                        {filteredEntries.map((entry) => {
                          const entryId = entry._id || entry.id;
                          const isEditing = editingEntryId === entryId;
                          const isPosted = entry.status === 'posted';
                          const isEditable = entry.status === 'planned' || entry.status === 'generated';
                          const isAssembled = Boolean(entry.generatedText) && Boolean(entry.generatedImageUrl);

                          if (isEditing) {
                            return (
                              <tr key={entryId} className="bg-indigo-950/30 border-l-4 border-l-indigo-500">
                                {/* Day Number */}
                                <td className="py-4 px-4 align-top">
                                  <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 font-mono font-bold border border-indigo-500/30">
                                    Day {entry.dayNumber}
                                  </span>
                                </td>

                                {/* Date */}
                                <td className="py-4 px-4 align-top text-slate-300 font-mono">
                                  {formatDate(entry.scheduledDate)}
                                </td>

                                {/* Edit Topic */}
                                <td className="py-4 px-4 align-top">
                                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                                    Topic
                                  </label>
                                  <input
                                    type="text"
                                    value={editFormData.topic}
                                    onChange={(e) =>
                                      setEditFormData((prev) => ({ ...prev, topic: e.target.value }))
                                    }
                                    placeholder="Enter topic..."
                                    className="w-full px-3 py-1.5 bg-slate-950 border border-indigo-500/60 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                </td>

                                {/* Edit Challenge & Notes */}
                                <td className="py-4 px-4 align-top space-y-2">
                                  <div>
                                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                                      Challenge
                                    </label>
                                    <input
                                      type="text"
                                      value={editFormData.challenge}
                                      onChange={(e) =>
                                        setEditFormData((prev) => ({ ...prev, challenge: e.target.value }))
                                      }
                                      placeholder="Challenge or key obstacle..."
                                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                                      Extra Notes
                                    </label>
                                    <input
                                      type="text"
                                      value={editFormData.extraNotes}
                                      onChange={(e) =>
                                        setEditFormData((prev) => ({ ...prev, extraNotes: e.target.value }))
                                      }
                                      placeholder="Extra instructions or context..."
                                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                                    />
                                  </div>
                                </td>

                                {/* Status */}
                                <td className="py-4 px-4 align-top text-center">
                                  {renderStatusBadge(entry.status)}
                                </td>

                                {/* Save / Cancel Actions */}
                                <td className="py-4 px-4 align-top text-right space-x-2">
                                  <button
                                    onClick={() => handleSaveEdit(entryId)}
                                    disabled={savingEdit}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm disabled:opacity-50"
                                  >
                                    {savingEdit ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Save className="w-3.5 h-3.5" />
                                    )}
                                    <span>Save</span>
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    disabled={savingEdit}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Cancel</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr
                              key={entryId}
                              className={`hover:bg-slate-950/40 transition-colors ${
                                isPosted ? 'opacity-90 bg-emerald-950/10' : ''
                              }`}
                            >
                              {/* Day Number & Thumbnail */}
                              <td className="py-3.5 px-4 font-mono font-bold text-white">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-indigo-300">
                                    Day {entry.dayNumber}
                                  </span>

                                  {/* Generated Image Thumbnail if available */}
                                  {entry.generatedImageUrl && (
                                    <button
                                      onClick={() => {
                                        setSelectedPreviewEntryId(entryId);
                                        setViewingPostEntry(entry);
                                      }}
                                      className="relative w-8 h-8 rounded-lg overflow-hidden border border-indigo-500/40 hover:border-indigo-400 shrink-0 group transition-all"
                                      title="View generated artwork"
                                    >
                                      <img
                                        src={entry.generatedImageUrl}
                                        alt={`Day ${entry.dayNumber} artwork`}
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                      />
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* Scheduled Date */}
                              <td className="py-3.5 px-4 text-slate-300 font-medium font-mono text-xs">
                                {formatDate(entry.scheduledDate)}
                              </td>

                              {/* Topic */}
                              <td className="py-3.5 px-4">
                                <p className="font-semibold text-white">
                                  {entry.topic || <span className="text-slate-500 italic">No topic specified</span>}
                                </p>
                              </td>

                              {/* Challenge & Notes */}
                              <td className="py-3.5 px-4 space-y-1">
                                {entry.challenge && (
                                  <p className="text-xs text-slate-300 flex items-center gap-1">
                                    <span className="text-indigo-400 font-semibold">Focus:</span> {entry.challenge}
                                  </p>
                                )}
                                {entry.extraNotes && (
                                  <p className="text-[11px] text-slate-400 italic">
                                    Notes: {entry.extraNotes}
                                  </p>
                                )}
                                {!entry.challenge && !entry.extraNotes && (
                                  <span className="text-slate-600">—</span>
                                )}
                              </td>

                              {/* Status Badge */}
                              <td className="py-3.5 px-4 text-center">
                                {renderStatusBadge(entry.status)}
                              </td>

                              {/* Action Buttons */}
                              <td className="py-3.5 px-4 text-right">
                                <div className="inline-flex items-center gap-1.5 justify-end">
                                  {/* 1. Generate / Regenerate AI Text Button */}
                                  <button
                                    onClick={() => handleGeneratePost(entryId)}
                                    disabled={!isEditable || generatingTextId === entryId}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                      isEditable
                                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-sm active:scale-95'
                                        : 'bg-slate-900/60 text-slate-600 border border-slate-800/80 cursor-not-allowed'
                                    }`}
                                    title={
                                      isPosted
                                        ? 'Post already published'
                                        : entry.generatedText
                                        ? 'Regenerate post text with AI'
                                        : 'Generate LinkedIn post text'
                                    }
                                  >
                                    {generatingTextId === entryId ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                                    ) : (
                                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                    )}
                                    <span>
                                      {generatingTextId === entryId
                                        ? 'Text...'
                                        : entry.generatedText
                                        ? 'Regen text'
                                        : 'Gen text'}
                                    </span>
                                  </button>

                                  {/* 2. Generate / Regenerate AI Image Button */}
                                  <button
                                    onClick={() => handleGenerateImage(entryId)}
                                    disabled={!isEditable || generatingImageId === entryId}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                      isEditable
                                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-sm active:scale-95'
                                        : 'bg-slate-900/60 text-slate-600 border border-slate-800/80 cursor-not-allowed'
                                    }`}
                                    title={
                                      isPosted
                                        ? 'Post already published'
                                        : entry.generatedImageUrl
                                        ? 'Regenerate visual image with AI'
                                        : 'Generate post image with AI'
                                    }
                                  >
                                    {generatingImageId === entryId ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                                    ) : (
                                      <ImageIcon className="w-3.5 h-3.5 text-pink-200" />
                                    )}
                                    <span>
                                      {generatingImageId === entryId
                                        ? 'Image...'
                                        : entry.generatedImageUrl
                                        ? 'Regen image'
                                        : 'Gen image'}
                                    </span>
                                  </button>

                                  {/* 3. View / Live Preview Button */}
                                  {(entry.generatedText || entry.generatedImageUrl) && (
                                    <button
                                      onClick={() => {
                                        setSelectedPreviewEntryId(entryId);
                                        setViewingPostEntry(entry);
                                      }}
                                      className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-medium border transition-colors shadow-sm ${
                                        isAssembled
                                          ? 'bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border-indigo-500/40'
                                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                      }`}
                                      title={isAssembled ? 'View assembled post' : 'View post assets'}
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* 4. Edit Pencil Icon Button */}
                                  <button
                                    onClick={() => handleStartEdit(entry)}
                                    disabled={!isEditable}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                      isEditable
                                        ? 'bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-200 border border-slate-700 active:scale-95 shadow-sm'
                                        : 'bg-slate-900/60 text-slate-600 border border-slate-800/80 cursor-not-allowed'
                                    }`}
                                    title={
                                      isPosted
                                        ? 'Entry is already posted to LinkedIn and cannot be edited.'
                                        : !isEditable
                                        ? 'Editing disabled for this status'
                                        : 'Edit Topic & Challenge'
                                    }
                                  >
                                    {isPosted ? (
                                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                                    ) : (
                                      <Pencil className="w-3.5 h-3.5 text-indigo-400 group-hover:text-white" />
                                    )}
                                  </button>

                                  {/* 5. Testing Helper: Status Switcher Dropdown */}
                                  <select
                                    value={entry.status}
                                    onChange={(e) => handleStatusChangeTest(entryId, e.target.value)}
                                    disabled={updatingStatusId === entryId}
                                    className="px-1.5 py-1 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-[11px] font-mono text-slate-400 focus:outline-none focus:text-white cursor-pointer"
                                    title="Testing: Manually toggle status to verify locking behavior"
                                  >
                                    <option value="planned">planned</option>
                                    <option value="generated">generated</option>
                                    <option value="posted">posted</option>
                                    <option value="failed">failed</option>
                                    <option value="skipped">skipped</option>
                                  </select>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* ------------------------------------------------------------- */}
            {/* DEBUG / RAW JSON DRAWER */}
            {/* ------------------------------------------------------------- */}
            <section className="rounded-2xl bg-slate-900/50 border border-slate-800 overflow-hidden">
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="w-full px-6 py-4 flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-indigo-400" />
                  <span>Developer Payload & Raw JSON Inspector</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-500">
                    {entries.length} records
                  </span>
                  {showRawJson ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {showRawJson && (
                <div className="p-6 bg-slate-950/95 border-t border-slate-800 space-y-4">
                  <div className="flex justify-end">
                    <button
                      onClick={handleCopyJSON}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">JSON Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>Copy Full Payload</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-xs font-mono text-indigo-200 overflow-x-auto p-4 bg-slate-900/80 rounded-xl border border-slate-800 max-h-96">
                    <code>
                      {JSON.stringify(
                        {
                          journey,
                          entries,
                        },
                        null,
                        2
                      )}
                    </code>
                  </pre>
                </div>
              )}
            </section>

            {/* ------------------------------------------------------------- */}
            {/* POST PREVIEW MODAL (FULL ASSEMBLED MOCKUP) */}
            {/* ------------------------------------------------------------- */}
            {viewingPostEntry && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
                <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  {/* Modal Header */}
                  <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 font-mono font-bold text-xs border border-indigo-500/30">
                        Day {viewingPostEntry.dayNumber}
                      </span>
                      <div>
                        <h3 className="text-base font-bold text-white">
                          LinkedIn Post Preview
                        </h3>
                        <p className="text-xs text-slate-400">
                          {formatDate(viewingPostEntry.scheduledDate)} &bull; {viewingPostEntry.topic || 'Daily Post'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setViewingPostEntry(null)}
                      className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      title="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Modal Body: Assembled Post Preview */}
                  <div className="p-6 overflow-y-auto space-y-6">
                    <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 shadow-inner space-y-4">
                      {/* LinkedIn User Row */}
                      <div className="flex items-center gap-3 pb-3 border-b border-slate-800/80">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center font-bold text-white text-sm">
                          YOU
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">Your Name</div>
                          <div className="text-[11px] text-slate-400">Building in public &bull; Scheduled {formatDate(viewingPostEntry.scheduledDate)}</div>
                        </div>
                      </div>

                      {/* Post Content */}
                      <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-sans select-text">
                        {viewingPostEntry.generatedText || (
                          <span className="text-slate-500 italic">No post text generated yet. Click "Generate text" below.</span>
                        )}
                      </div>

                      {/* Generated Image if present */}
                      {viewingPostEntry.generatedImageUrl && (
                        <div className="rounded-2xl overflow-hidden border border-slate-800 mt-3 max-h-96 flex items-center justify-center bg-black/40">
                          <img
                            src={viewingPostEntry.generatedImageUrl}
                            alt="Generated post artwork"
                            className="w-full h-auto object-cover max-h-96"
                          />
                        </div>
                      )}
                    </div>

                    {/* Stats bar */}
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-slate-300">
                          {viewingPostEntry.generatedText?.length || 0}
                        </span>
                        <span>/ 1300 characters</span>
                      </div>
                      <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {viewingPostEntry.generatedText && viewingPostEntry.generatedImageUrl
                          ? 'Fully Assembled (Text + Image)'
                          : viewingPostEntry.generatedText
                          ? 'Text Generated'
                          : 'Image Generated'}
                      </span>
                    </div>
                  </div>

                  {/* Modal Footer Actions */}
                  <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleGeneratePost(viewingPostEntry._id || viewingPostEntry.id)}
                        disabled={generatingTextId === (viewingPostEntry._id || viewingPostEntry.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            generatingTextId === (viewingPostEntry._id || viewingPostEntry.id)
                              ? 'animate-spin'
                              : ''
                          }`}
                        />
                        <span>{viewingPostEntry.generatedText ? 'Regen Text' : 'Gen Text'}</span>
                      </button>

                      <button
                        onClick={() => handleGenerateImage(viewingPostEntry._id || viewingPostEntry.id)}
                        disabled={generatingImageId === (viewingPostEntry._id || viewingPostEntry.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            generatingImageId === (viewingPostEntry._id || viewingPostEntry.id)
                              ? 'animate-spin'
                              : ''
                          }`}
                        />
                        <span>{viewingPostEntry.generatedImageUrl ? 'Regen Image' : 'Gen Image'}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {viewingPostEntry.generatedText && (
                        <button
                          onClick={() => handleCopyPostText(viewingPostEntry.generatedText)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all"
                        >
                          {copiedPostText ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copied Text!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>Copy Text</span>
                            </>
                          )}
                        </button>
                      )}

                      {viewingPostEntry.generatedImageUrl && (
                        <button
                          onClick={() => handleCopyImageUrl(viewingPostEntry.generatedImageUrl)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all"
                        >
                          {copiedImageUrl ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copied URL!</span>
                            </>
                          ) : (
                            <>
                              <ImageIcon className="w-3.5 h-3.5 text-pink-400" />
                              <span>Copy Image URL</span>
                            </>
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => setViewingPostEntry(null)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default JourneyDetailPage;

