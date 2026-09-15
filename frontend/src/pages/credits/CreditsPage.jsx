import React, { useState, useEffect } from 'react';
import {
  Coins,
  Sparkles,
  Download,
  CheckCircle2,
  HelpCircle,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { creditService } from '../../services/creditService';
import { useCredits } from '../../context/CreditsContext';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../../components/common/EmptyState';
import { Skeleton } from '../../components/common/Skeleton';

export const CreditsPage = () => {
  const { creditBalance, refreshBalance } = useCredits();
  const { showToast } = useToast();

  const [transactions, setTransactions] = useState([]);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'deduction' | 'topup' | 'refund'
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const data = await creditService.getTransactions({ page, limit: 15 });
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
    } catch (err) {
      showToast(err.message || 'Failed to load credit ledger.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    refreshBalance();
  }, [page]);

  const handleExportCSV = () => {
    if (!transactions.length) {
      showToast('No transactions to export.', 'info');
      return;
    }
    const headers = ['Ledger ID', 'Date', 'Reason', 'Amount', 'Balance After', 'Note'];
    const rows = transactions.map((t) => [
      t._id,
      new Date(t.createdAt).toISOString(),
      t.reason,
      t.amount,
      t.balanceAfter,
      `"${(t.note || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `postbot_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Ledger CSV exported successfully!', 'success');
  };

  // Client-side filter on transactions
  const filteredTransactions = transactions.filter((t) => {
    if (filterType === 'all') return true;
    if (filterType === 'deduction') return t.amount < 0;
    if (filterType === 'topup') return t.amount > 0 && t.reason === 'purchase';
    if (filterType === 'refund') return t.amount > 0 && t.reason === 'refund';
    return true;
  });

  const getReasonBadge = (reason) => {
    switch (reason) {
      case 'generation':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-soft text-brand border border-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-brand"></span>
            Post Generation
          </span>
        );
      case 'regeneration':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Sparkles className="w-2.5 h-2.5 fill-purple-600 text-purple-600" />
            AI Revamp
          </span>
        );
      case 'purchase':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ArrowUpRight className="w-2.5 h-2.5 text-emerald-600" />
            Top-Up
          </span>
        );
      case 'refund':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <ArrowDownLeft className="w-2.5 h-2.5 text-amber-600" />
            Refund
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface border border-border-warm text-ink-muted">
            {reason}
          </span>
        );
    }
  };

  return (
    <div className="space-y-7 max-w-7xl mx-auto animate-fade-in py-2">
      {/* SectionHeader */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-card border border-border-warm rounded-full text-[11px] font-semibold tracking-wider text-brand uppercase mb-2 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-brand"></span>
            <span>Balance &amp; Usage Transparency</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Credits &amp; Ledger</h1>
          <p className="text-sm text-ink-muted mt-1 max-w-2xl leading-relaxed">
            Real-time balance, transparent consumption rates, and an immutable audit trail of all AI drafting and image synthesis executions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-ink bg-surface-card border border-border-warm rounded-xl hover:bg-surface transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-ink-muted" />
            <span>Export Ledger CSV</span>
          </button>
        </div>
      </section>

      {/* BalancesAndEconomyGrid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Available Balance Card */}
        <div className="lg:col-span-6 bg-surface-card border border-border-warm rounded-2xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-brand" />
                <span>Available Credits</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                ● Beta Active
              </span>
            </div>

            {/* Big Number */}
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-5xl font-extrabold font-mono text-ink tracking-tight">
                {creditBalance}
              </span>
              <span className="text-sm font-semibold text-ink-muted">credits remaining</span>
            </div>

            <p className="text-xs text-ink-muted leading-relaxed mb-6">
              Every scheduled day of content costs <strong className="text-ink font-semibold">1 credit</strong>. Granular AI caption, hashtag, and visual revamps cost 1 credit. Manual editing &amp; custom image uploads are 100% free.
            </p>
          </div>

          {/* Card Actions */}
          <div className="pt-4 border-t border-border-light flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative group">
                <button
                  type="button"
                  className="bg-coral hover:bg-coral-hover text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md hover:shadow-lg flex items-center gap-1.5 transition-all cursor-pointer"
                  onClick={() => showToast('Credit top-ups will be available soon! Contact support for founder grant.', 'info')}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Top Up Credits</span>
                </button>
              </div>
              <span className="text-xs text-ink-muted">Founder packs start at $19</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-ink-muted font-medium bg-surface px-2.5 py-1.5 rounded-lg border border-border-warm">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
              <span>Auto-recharge: <strong className="text-ink">Disabled</strong></span>
            </div>
          </div>
        </div>

        {/* How Credits Work (Rates Card) */}
        <div className="lg:col-span-6 bg-surface-card border border-border-warm rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-brand" />
                <span>Credit Economy &amp; Rates</span>
              </h3>
              <span className="text-[11px] font-semibold text-brand hover:underline cursor-pointer">
                Always Transparent
              </span>
            </div>

            {/* Rate Items Stack */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-border-light">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-brand"></div>
                  <span className="font-semibold text-ink">Post Generation (Full Batch Item)</span>
                </div>
                <span className="font-mono font-bold text-ink bg-white px-2 py-0.5 rounded border border-border-warm">
                  1 credit / day
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-border-light">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  <span className="font-semibold text-ink">AI Image Synthesis (High Quality)</span>
                </div>
                <span className="font-mono font-bold text-ink bg-white px-2 py-0.5 rounded border border-border-warm">
                  1 credit / image
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-border-light">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  <span className="font-semibold text-ink">AI Copy &amp; Hook Regeneration</span>
                </div>
                <span className="font-mono font-bold text-ink bg-white px-2 py-0.5 rounded border border-border-warm">
                  1 credit / run
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-emerald-950">Manual Editing &amp; Custom Uploads</span>
                </div>
                <span className="font-mono font-bold text-emerald-700 bg-white px-2.5 py-0.5 rounded-full border border-emerald-300 text-[11px]">
                  0 credits (Always Free)
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border-light text-[11px] text-ink-muted flex items-center justify-between">
            <span>Audit integrity guaranteed by immutable ledger timestamps</span>
            <span className="text-ink font-mono font-medium">Synced Realtime</span>
          </div>
        </div>
      </section>

      {/* TransactionLedgerSection */}
      <section className="bg-surface-card border border-border-warm rounded-2xl shadow-sm overflow-hidden">
        {/* Table Control Toolbar */}
        <div className="p-5 border-b border-border-warm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-ink">Transaction History</h3>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-surface border border-border-warm text-ink-muted font-mono">
                {total} entries
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              Transparent immutable audit log of automated and manual token consumption
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-surface p-1 rounded-xl border border-border-warm text-xs">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-white text-brand shadow-xs border border-border-warm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              All Activity
            </button>
            <button
              type="button"
              onClick={() => setFilterType('deduction')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                filterType === 'deduction'
                  ? 'bg-white text-brand shadow-xs border border-border-warm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Deductions
            </button>
            <button
              type="button"
              onClick={() => setFilterType('topup')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                filterType === 'topup'
                  ? 'bg-white text-brand shadow-xs border border-border-warm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Top-Ups
            </button>
            <button
              type="button"
              onClick={() => setFilterType('refund')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                filterType === 'refund'
                  ? 'bg-white text-brand shadow-xs border border-border-warm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Refunds
            </button>
          </div>
        </div>

        {/* Table View */}
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No Ledger Transactions Found"
            description="When you generate batches or use AI regeneration, every credit deduction and refund is recorded here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface/60 border-b border-border-warm text-ink-muted uppercase font-semibold text-[11px] tracking-wider">
                  <th className="py-3 px-5" scope="col">Date &amp; Time</th>
                  <th className="py-3 px-4" scope="col">Reason &amp; Type</th>
                  <th className="py-3 px-4" scope="col">Context / Note</th>
                  <th className="py-3 px-4 text-right" scope="col">Amount</th>
                  <th className="py-3 px-4 text-right" scope="col">Balance After</th>
                  <th className="py-3 px-5 text-right font-mono" scope="col">Ledger ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light font-medium">
                {filteredTransactions.map((tx) => {
                  const isPositive = tx.amount > 0;
                  return (
                    <tr key={tx._id} className="hover:bg-surface/50 transition-colors">
                      <td className="py-3.5 px-5 text-ink-muted whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-4">{getReasonBadge(tx.reason)}</td>
                      <td className="py-3.5 px-4 text-ink font-normal max-w-xs truncate">
                        {tx.note || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold whitespace-nowrap">
                        <span className={isPositive ? 'text-emerald-600' : 'text-ink'}>
                          {isPositive ? `+${tx.amount}` : tx.amount}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-ink font-semibold whitespace-nowrap">
                        {tx.balanceAfter}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono text-ink-subtle text-[11px]">
                        #{tx._id.slice(-6).toUpperCase()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {total > 15 && (
          <div className="p-4 border-t border-border-warm flex items-center justify-between text-xs text-ink-muted bg-surface/30">
            <span>
              Showing {(page - 1) * 15 + 1} to {Math.min(page * 15, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-border-warm bg-white hover:bg-surface text-xs font-semibold text-ink disabled:opacity-40 transition-colors cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page * 15 >= total}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-border-warm bg-white hover:bg-surface text-xs font-semibold text-ink disabled:opacity-40 transition-colors cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
