import React, { useState, useEffect } from 'react';
import {
  User,
  Clock,
  Globe,
  Bell,
  Mail,
  Smartphone,
  Check,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Trash2,
  Save,
  Lock,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { linkedinService } from '../../services/linkedinService';
import { Modal } from '../../components/common/Modal';
import { LinkedInIcon } from '../../components/common/LinkedInIcon';

const TIMEZONE_OPTIONS = [
  'America/New_York (UTC-04:00) Eastern Time',
  'America/Chicago (UTC-05:00) Central Time',
  'America/Denver (UTC-06:00) Mountain Time',
  'America/Los_Angeles (UTC-07:00) Pacific Time',
  'Europe/London (UTC+01:00) GMT/BST',
  'Europe/Paris (UTC+02:00) CET',
  'Europe/Berlin (UTC+02:00) CET',
  'Asia/Kolkata (UTC+05:30) IST',
  'Asia/Dubai (UTC+04:00) GST',
  'Asia/Singapore (UTC+08:00) SGT',
  'Asia/Tokyo (UTC+09:00) JST',
  'Australia/Sydney (UTC+10:00) AEST',
  'UTC',
];

export const SettingsPage = () => {
  const { user, updateUserProfile, refreshUser } = useAuth();
  const { showToast } = useToast();

  // Profile
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Posting preferences
  const [timezone, setTimezone] = useState('America/New_York (UTC-04:00) Eastern Time');
  const [defaultPostTime, setDefaultPostTime] = useState('09:00');

  // Notification preferences
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [phone, setPhone] = useState('');

  // State
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingLinkedIn, setIsConnectingLinkedIn] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');

      // Match timezone format
      if (user.timezone) {
        const found = TIMEZONE_OPTIONS.find((tz) => tz.includes(user.timezone));
        setTimezone(found || user.timezone);
      }
      setDefaultPostTime(user.defaultPostTime || '09:00');

      if (user.notificationPrefs) {
        setEmailEnabled(user.notificationPrefs.emailEnabled ?? true);
        setSmsEnabled(user.notificationPrefs.smsEnabled ?? false);
        setPhone(user.notificationPrefs.phone || '');
      }
    }
  }, [user]);

  const handleSavePreferences = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      // Extract clean timezone identifier (e.g. 'America/New_York' from 'America/New_York (...)')
      const cleanTimezone = timezone.split(' ')[0] || timezone;
      await updateUserProfile({
        name: name.trim(),
        timezone: cleanTimezone,
        defaultPostTime,
        notificationPrefs: {
          email: email.trim(),
          phone: phone.trim(),
          emailEnabled,
          smsEnabled,
        },
      });
      showToast('Settings saved successfully.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save settings.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      if (user.timezone) {
        const found = TIMEZONE_OPTIONS.find((tz) => tz.includes(user.timezone));
        setTimezone(found || user.timezone);
      }
      setDefaultPostTime(user.defaultPostTime || '09:00');
      if (user.notificationPrefs) {
        setEmailEnabled(user.notificationPrefs.emailEnabled ?? true);
        setSmsEnabled(user.notificationPrefs.smsEnabled ?? false);
        setPhone(user.notificationPrefs.phone || '');
      }
    }
    showToast('Changes discarded.', 'info');
  };

  const handleConnectLinkedIn = async () => {
    setIsConnectingLinkedIn(true);
    try {
      const data = await linkedinService.getConnectUrl();
      if (data?.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error('No LinkedIn OAuth URL returned.');
      }
    } catch (err) {
      showToast(err.message || 'Could not initiate LinkedIn connection.', 'error');
      setIsConnectingLinkedIn(false);
    }
  };

  const handleDisconnectLinkedIn = async () => {
    setIsDisconnecting(true);
    try {
      await linkedinService.disconnect();
      await refreshUser();
      setShowDisconnectModal(false);
      showToast('LinkedIn account disconnected successfully.', 'info');
    } catch (err) {
      showToast(err.message || 'Failed to disconnect LinkedIn account.', 'error');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isLinkedInConnected = Boolean(user?.linkedin?.isConnected);

  return (
    <div className="max-w-5xl mx-auto pb-36 space-y-8 animate-fade-in py-2">
      {/* PageHeader */}
      <section className="space-y-2">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-brand-soft text-brand border border-brand/20 text-[11px] font-bold tracking-wider uppercase shadow-2xs">
          Account Configuration • Preferences
        </div>
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">
          Account Settings &amp; Preferences
        </h1>
        <p className="text-ink-muted text-sm leading-relaxed max-w-2xl">
          Configure posting hours, global timezone, notification delivery channels, and LinkedIn OAuth credentials to automate your publishing cadence smoothly.
        </p>
      </section>

      <form onSubmit={handleSavePreferences} className="space-y-8">
        {/* Section 1: Profile Information */}
        <section className="bg-surface-card rounded-2xl border border-border-warm shadow-sm p-6 md:p-7 space-y-6">
          <div className="flex items-center gap-3 border-b border-border-light pb-4">
            <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center">
              <User className="w-4 h-4 stroke-2" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">Profile Information</h2>
              <p className="text-xs text-ink-muted">Personal identity details associated with PostBot Founder account</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Full Name */}
            <div className="space-y-2">
              <label htmlFor="full-name" className="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                Full Name
              </label>
              <input
                id="full-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-border-warm rounded-xl px-4 py-2.5 text-sm font-medium text-ink focus:border-brand focus:ring-1 focus:ring-brand transition-all outline-none"
              />
            </div>

            {/* Email Address (Read Only) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="email-address" className="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                  Email Address
                </label>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-muted bg-surface px-2 py-0.5 rounded border border-border-warm">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Read-only</span>
                </span>
              </div>
              <input
                id="email-address"
                type="email"
                readOnly
                value={email}
                className="w-full bg-surface/60 border border-border-warm rounded-xl px-4 py-2.5 text-sm font-medium text-ink-muted cursor-not-allowed outline-none select-all"
              />
            </div>
          </div>
        </section>

        {/* Section 2: Publishing & Scheduling Preferences */}
        <section className="bg-surface-card rounded-2xl border border-border-warm shadow-sm p-6 md:p-7 space-y-6">
          <div className="border-b border-border-light pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center">
                <Clock className="w-4 h-4 stroke-2" />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink">Publishing &amp; Scheduling Preferences</h2>
                <p className="text-xs text-ink-muted">Set default slot allocation criteria for weekly batch generator</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-muted bg-surface border border-border-warm p-3 rounded-xl leading-relaxed">
              💡 When you confirm a weekly batch, posts are scheduled sequentially starting the following day at this preferred time and timezone.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Primary Timezone */}
            <div className="space-y-2">
              <label htmlFor="primary-timezone" className="block text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-brand" />
                <span>Primary Timezone</span>
              </label>
              <div className="relative">
                <select
                  id="primary-timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full appearance-none bg-white border border-border-warm rounded-xl px-4 py-2.5 text-sm font-medium text-ink focus:border-brand focus:ring-1 focus:ring-brand outline-none pr-10 cursor-pointer"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-ink-muted">
                  <ChevronDown className="w-4 h-4 stroke-2" />
                </div>
              </div>
              <span className="text-[11px] text-ink-muted">All queued timestamps will align with this geographic zone.</span>
            </div>

            {/* Default Daily Post Time */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="post-time" className="block text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-brand" />
                  <span>Default Daily Post Time</span>
                </label>
                <span className="text-[11px] font-semibold text-brand bg-brand-soft px-2 py-0.5 rounded border border-brand/20">
                  Peak Founder Window
                </span>
              </div>
              <input
                id="post-time"
                type="time"
                value={defaultPostTime}
                onChange={(e) => setDefaultPostTime(e.target.value)}
                className="w-full bg-white border border-border-warm rounded-xl px-4 py-2.5 text-sm font-semibold text-ink focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              />
              <span className="text-[11px] text-ink-muted">Suggested: 08:30 AM - 09:30 AM for maximum B2B feed visibility.</span>
            </div>
          </div>
        </section>

        {/* Section 3: LinkedIn Profile Integration */}
        <section className="bg-surface-card rounded-2xl border border-border-warm shadow-sm p-6 md:p-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-light pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#0077b5]/10 text-[#0077b5] flex items-center justify-center font-bold">
                <LinkedInIcon className="w-4 h-4 fill-current" />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink">LinkedIn Profile Integration</h2>
                <p className="text-xs text-ink-muted">OAuth connection details for publishing directly to your feed</p>
              </div>
            </div>

            {isLinkedInConnected ? (
              <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Connected &amp; Healthy</span>
              </span>
            ) : (
              <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border-warm text-xs font-semibold text-ink-muted">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>Not Connected</span>
              </span>
            )}
          </div>

          <div className="p-5 rounded-xl bg-surface border border-border-warm flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-ink">
                  {isLinkedInConnected ? 'Personal Profile Authenticated' : 'No Profile Connected'}
                </h3>
                <span className="text-[10px] bg-white border border-border-warm font-mono px-2 py-0.5 rounded text-ink-muted">
                  w_member_social
                </span>
              </div>
              <p className="text-xs text-ink-muted max-w-lg leading-relaxed">
                {isLinkedInConnected
                  ? `Posts publish automatically using authorized scopes. Connected on ${
                      user?.linkedin?.connectedAt
                        ? new Date(user.linkedin.connectedAt).toLocaleDateString()
                        : 'recent session'
                    }.`
                  : 'Connect your LinkedIn account to enable 1-click scheduling and automated posting.'}
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto">
              {isLinkedInConnected ? (
                <>
                  <button
                    type="button"
                    onClick={handleConnectLinkedIn}
                    className="flex-1 md:flex-initial text-xs font-semibold text-ink hover:text-brand bg-white border border-border-warm px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
                  >
                    Re-authorize
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDisconnectModal(true)}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 stroke-2" />
                    <span>Disconnect</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectLinkedIn}
                  disabled={isConnectingLinkedIn}
                  className="flex-1 md:flex-initial flex items-center justify-center gap-2 text-xs font-bold text-white bg-coral hover:bg-coral-hover px-4 py-2.5 rounded-xl shadow-md transition-all cursor-pointer"
                >
                  <LinkedInIcon className="w-4 h-4 fill-current" />
                  <span>Connect LinkedIn</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Section 4: Failure & Token Alert Preferences */}
        <section className="bg-surface-card rounded-2xl border border-border-warm shadow-sm p-6 md:p-7 space-y-6">
          <div className="border-b border-border-light pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-coral-soft text-coral flex items-center justify-center">
                <Bell className="w-4 h-4 stroke-2" />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink">Failure &amp; Token Alert Preferences</h2>
                <p className="text-xs text-ink-muted">
                  Choose how PostBot alerts you if LinkedIn token expires or scheduled posts fail to publish.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Email Notifications */}
            <div className="p-4 rounded-xl border border-border-warm bg-[#fefdfb] hover:bg-surface/50 transition-colors flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 stroke-2" />
                </div>
                <div>
                  <p className="text-xs font-bold text-ink">Email Notifications</p>
                  <p className="text-xs text-ink-muted">Receive immediate email when a post fails or LinkedIn token needs refresh.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                  className="w-5 h-5 rounded border-border-warm text-brand focus:ring-brand focus:ring-offset-1 transition cursor-pointer"
                />
              </label>
            </div>

            {/* SMS Urgent Alerts */}
            <div className="p-4 rounded-xl border border-border-warm bg-[#fefdfb] hover:bg-surface/50 transition-colors flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-coral-soft text-coral flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4 stroke-2" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-ink">SMS Urgent Alerts</p>
                    <p className="text-xs text-ink-muted">Send SMS via Twilio for critical failures or queue exhaustion.</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={smsEnabled}
                    onChange={(e) => setSmsEnabled(e.target.checked)}
                    className="w-5 h-5 rounded border-border-warm text-brand focus:ring-brand focus:ring-offset-1 transition cursor-pointer"
                  />
                </label>
              </div>

              {/* Sub-input for Mobile Number */}
              {smsEnabled && (
                <div className="pt-3 border-t border-border-light pl-12 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between max-w-md">
                    <label htmlFor="phone-number" className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                      Mobile Phone Number (E.164 Format)
                    </label>
                  </div>
                  <div className="max-w-md relative">
                    <input
                      id="phone-number"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 019-2834"
                      className="w-full bg-white border border-border-warm rounded-xl px-4 py-2 font-mono text-xs font-semibold text-ink focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-ink-muted">Include country code (e.g. +1...)</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Sticky Bottom Save Dock */}
        <footer className="fixed bottom-0 right-0 left-0 lg:left-64 bg-surface/95 backdrop-blur-md border-t border-border-warm py-4 px-6 sm:px-8 z-30 shadow-lg">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
              <span>Unsaved changes will apply automatically to newly generated weekly batches.</span>
            </div>

            <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleDiscard}
                className="px-4 py-2.5 rounded-xl border border-border-warm text-xs font-bold text-ink-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 bg-coral hover:bg-coral-hover text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Save All Preferences</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </footer>
      </form>

      {/* Disconnect Modal */}
      <Modal
        isOpen={showDisconnectModal}
        onClose={() => setShowDisconnectModal(false)}
        title="Disconnect LinkedIn Account?"
        description="Disconnecting your account will halt all scheduled posts until you reconnect."
      >
        <div className="space-y-4">
          <p className="text-xs text-ink-muted leading-relaxed">
            Your stored access and refresh tokens will be wiped. Active batches will be unable to publish automatically without an active connection.
          </p>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowDisconnectModal(false)}
              disabled={isDisconnecting}
              className="px-4 py-2 rounded-lg border border-border-warm bg-white hover:bg-surface text-xs font-semibold text-ink transition-colors cursor-pointer"
            >
              Keep Connected
            </button>
            <button
              type="button"
              onClick={handleDisconnectLinkedIn}
              disabled={isDisconnecting}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isDisconnecting ? 'Disconnecting...' : 'Disconnect Now'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
