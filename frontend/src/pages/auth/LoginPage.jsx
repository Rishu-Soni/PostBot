import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, ArrowRight, Lock, Mail, AlertCircle, Eye, EyeOff, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { LinkedInIcon } from '../../components/common/LinkedInIcon';

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen dot-grid flex flex-col">
      {/* Top Navbar */}
      <header className="flex items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5 font-bold text-ink text-lg tracking-tight">
          <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center text-white shadow-sm">
            <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <span>PostBot</span>
          <span className="text-[10px] font-bold tracking-wider uppercase text-brand bg-brand-soft rounded px-1.5 py-0.5 border border-brand/20">PRO</span>
        </Link>
        <p className="text-sm text-ink-muted">
          Need an account?{' '}
          <Link to="/register" className="font-semibold text-brand hover:text-brand-hover transition-colors">
            Create founder account
          </Link>
        </p>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          {/* Login Card */}
          <div className="bg-surface-card rounded-2xl border border-border-warm shadow-warm-lg overflow-hidden gradient-bar">
            <div className="p-8 pt-10">
              {/* Icon & Header */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-soft border border-brand/15 text-brand mb-4">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
                  Welcome back to PostBot
                </h1>
                <p className="text-sm text-ink-muted mt-2">
                  Turn your founder brain-dumps into consistent weekly LinkedIn posts
                </p>
              </div>

              {/* Continue with LinkedIn Button */}
              <button className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl border border-border-warm bg-surface-card hover:bg-canvas text-ink font-medium text-sm transition-all mb-5">
                <LinkedInIcon className="w-4 h-4" />
                <span>Continue with LinkedIn</span>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-border-warm" />
                <span className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">Or continue with email</span>
                <div className="flex-1 h-px bg-border-warm" />
              </div>

              {/* Error */}
              {error && (
                <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-700 text-sm animate-fade-in">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-ink-subtle absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@startup.io"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-card border border-border-warm text-ink text-sm focus:border-brand focus:ring-1 focus:ring-brand/30 placeholder-ink-subtle transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-ink uppercase tracking-wider">
                      Password
                    </label>
                    <button type="button" className="text-xs font-medium text-brand hover:text-brand-hover transition-colors">
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-ink-subtle absolute left-3.5 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-surface-card border border-border-warm text-ink text-sm focus:border-brand focus:ring-1 focus:ring-brand/30 placeholder-ink-subtle transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3 text-ink-subtle hover:text-ink transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-border-warm text-brand focus:ring-brand/30"
                  />
                  <span className="text-sm text-ink-muted">Remember me for 30 days</span>
                </label>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={loading}
                  icon={ArrowRight}
                  iconPosition="right"
                  className="w-full mt-1"
                >
                  Sign In to Account
                </Button>
              </form>

              {/* Dashed Divider */}
              <div className="my-5 border-t border-dashed border-border-warm" />

              {/* Quick Demo Access Box */}
              <div className="p-4 rounded-xl bg-canvas border border-border-light space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-brand" />
                    <span>Quick Demo Access</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200 font-semibold">
                    All Features Unlocked
                  </span>
                </div>
                <div className="text-[11px] text-ink-muted font-mono space-y-1 bg-surface-card p-2.5 rounded-lg border border-border-light">
                  <div className="flex justify-between">
                    <span className="text-ink-subtle">Email:</span>
                    <span className="text-ink font-semibold">test@postbot.io</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-subtle">Pass:</span>
                    <span className="text-ink font-semibold">Password123!</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-border-light text-[10px]">
                    <span>Status: <span className="text-green-600 font-semibold">Ready</span></span>
                    <span>Credits: <span className="text-brand font-semibold">100 Loaded</span></span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  className="w-full text-xs font-semibold py-1.5"
                  icon={Zap}
                  onClick={async () => {
                    setEmail('test@postbot.io');
                    setPassword('Password123!');
                    setLoading(true);
                    setError(null);
                    try {
                      await login('test@postbot.io', 'Password123!');
                      navigate(from, { replace: true });
                    } catch (err) {
                      setError(err.message || 'Login failed.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Fill Test Credentials
                </Button>
              </div>

              {/* Footer Link */}
              <div className="mt-6 pt-5 border-t border-border-light text-center">
                <p className="text-sm text-ink-muted">
                  Don&apos;t have an account yet?{' '}
                  <Link
                    to="/register"
                    className="font-semibold text-brand hover:text-brand-hover transition-colors underline"
                  >
                    Create founder account
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="flex items-center justify-center gap-6 mt-6 text-xs text-ink-subtle">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              256-bit SSL Security
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              SOC2 Type II Compliant
            </span>
          </div>

          {/* Copyright */}
          <p className="text-center text-xs text-ink-subtle mt-6">
            © 2026 PostBot Inc. Architectural Content Intelligence. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};
