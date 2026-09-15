import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { linkedinService } from '../../services/linkedinService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { LinkedInIcon } from '../../components/common/LinkedInIcon';

export const LinkedInCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { showToast } = useToast();

  const [status, setStatus] = useState('processing'); // 'processing' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      setStatus('error');
      setErrorMessage(errorDescription || 'LinkedIn authorization was cancelled or denied.');
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setErrorMessage('Missing OAuth callback authorization parameters.');
      return;
    }

    const exchangeCode = async () => {
      try {
        await linkedinService.handleCallback(code, state);
        await refreshUser();
        setStatus('success');
        showToast('LinkedIn account successfully connected!', 'success');
        setTimeout(() => {
          navigate('/settings');
        }, 1500);
      } catch (err) {
        setStatus('error');
        setErrorMessage(err.message || 'Failed to complete LinkedIn authentication.');
      }
    };

    exchangeCode();
  }, [searchParams, navigate, refreshUser, showToast]);

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full p-8 text-center space-y-6 bg-surface-card border border-border-warm rounded-2xl shadow-md">
        <div className="w-16 h-16 rounded-2xl bg-[#0077b5]/10 border border-[#0077b5]/20 flex items-center justify-center text-[#0077b5] mx-auto">
          <LinkedInIcon className="w-8 h-8 fill-[#0077b5]" />
        </div>

        {status === 'processing' && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-ink">
              Connecting LinkedIn Account...
            </h2>
            <div className="flex items-center justify-center gap-2 text-xs text-ink-muted">
              <Loader2 className="w-4 h-4 animate-spin text-brand" />
              <span>Verifying authorization code with LinkedIn API</span>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-3 animate-fade-in">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h2 className="text-lg font-bold text-ink">Connection Successful!</h2>
            <p className="text-xs text-ink-muted">
              Your profile is now connected. Redirecting you to Settings...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4 animate-fade-in">
            <AlertCircle className="w-12 h-12 text-rose-600 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-ink">Connection Failed</h2>
              <p className="text-xs text-rose-700 leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="mt-2 px-4 py-2 bg-white border border-border-warm rounded-xl text-xs font-bold text-ink hover:bg-surface transition-colors cursor-pointer"
            >
              Back to Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
