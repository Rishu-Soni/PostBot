import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, ArrowRight, Lock, Mail, AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { LinkedInIcon } from '../../components/common/LinkedInIcon';
import { Logo } from '../../components/common/Logo';

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
        <Link to="/" className="flex items-center gap-2 font-bold text-ink text-base tracking-tight">
          <Logo size="sm" />
          <span>PostBot</span>
          <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded" style={{ background: '#E2E8F0', color: '#64748B' }}>
            PRO
          </span>
        </Link>
        <div />
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          {/* Login Card */}
          <div className="bg-[#FFFFFF] rounded-[16px] shadow-card border border-border-warm/60 overflow-hidden gradient-bar">
            <div className="p-8 pt-10">
              {/* Icon & Header */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-soft border border-brand/15 text-brand mb-4">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h1 className="text-[26px] font-semibold text-[#0A192F] leading-[1.25] tracking-tight">
                  Welcome back to PostBot
                </h1>
                <p className="text-[14px] font-normal text-[#4A5568] leading-[1.5] mt-2">
                  Turn your founder brain-dumps into consistent weekly LinkedIn posts
                </p>
              </div>

              {/* Continue with LinkedIn Button */}
              <button className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-[8px] border border-[#E2E8F0] bg-[#FFFFFF] text-[#1A202C] font-medium text-sm transition-all hover:bg-[#F7FAFC] hover:shadow-sm mb-5">
                <LinkedInIcon className="w-4 h-4" />
                <span>Continue with LinkedIn</span>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-[#E2E8F0]" />
                <span className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">Or continue with email</span>
                <div className="flex-1 h-px bg-[#E2E8F0]" />
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
                  <label className="block text-[11px] font-semibold text-[#2D3748] uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="w-4 h-4 text-[#A0AEC0] absolute left-3.5 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@company.com"
                      className="w-full pl-10 pr-4 py-3 rounded-[8px] bg-[#FFFFFF] border border-[#CBD5E1] text-[#1A202C] text-sm placeholder-[#A0AEC0] focus:border-[#1E88E5] focus:outline-none focus:ring-3 focus:ring-[#1E88E5]/15 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[11px] font-semibold text-[#2D3748] uppercase tracking-wider">
                      Password
                    </label>
                    <button type="button" className="text-xs font-medium text-[#1E88E5] hover:underline transition-colors">
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-[#A0AEC0] absolute left-3.5 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-10 py-3 rounded-[8px] bg-[#FFFFFF] border border-[#CBD5E1] text-[#1A202C] text-sm placeholder-[#A0AEC0] focus:border-[#1E88E5] focus:outline-none focus:ring-3 focus:ring-[#1E88E5]/15 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 text-ink-subtle hover:text-ink transition-colors"
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
                    className="w-4 h-4 rounded border-[#CBD5E1] text-brand focus:ring-brand/30"
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
                  className="w-full mt-1 bg-[#1E88E5] hover:bg-[#1565C0] text-white rounded-[8px] font-semibold py-3"
                >
                  Sign In to Account
                </Button>
              </form>

              {/* Footer Link */}
              <div className="mt-6 pt-5 border-t border-border-light text-center">
                <p className="text-sm text-ink-muted">
                  Don&apos;t have an account yet?{' '}
                  <Link
                    to="/register"
                    className="font-medium text-[#1E88E5] hover:underline transition-colors"
                  >
                    Create founder account
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="flex items-center justify-center gap-6 mt-6 text-[11px] text-[#94A3B8]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
              256-bit SSL Security
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
              SOC2 Type II Compliant
            </span>
          </div>

          {/* Copyright */}
          <p className="text-center text-[11px] text-[#94A3B8] mt-4">
            © 2026 PostBot Inc. Architectural Content Intelligence. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};
