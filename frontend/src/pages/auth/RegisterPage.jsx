import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Lock, Mail, User, AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { LinkedInIcon } from '../../components/common/LinkedInIcon';

export const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Simple password strength calculation
  const getPasswordStrength = () => {
    if (!password) return { level: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) return { level: score, label: 'Weak', color: 'bg-red-400' };
    if (score <= 3) return { level: score, label: 'Fair', color: 'bg-amber-400' };
    if (score <= 4) return { level: score, label: 'Good', color: 'bg-blue-400' };
    return { level: score, label: 'Strong', color: 'bg-green-500' };
  };

  const strength = getPasswordStrength();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please provide your name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
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
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-brand hover:text-brand-hover transition-colors">
            Sign In
          </Link>
        </p>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          {/* Register Card */}
          <div className="bg-surface-card rounded-2xl border border-border-warm shadow-warm-lg overflow-hidden gradient-bar">
            <div className="p-8 pt-10">
              {/* Icon & Header */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-soft border border-brand/15 text-brand mb-4">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
                  Create your account
                </h1>
                <p className="text-sm text-ink-muted mt-2">
                  Build your personal brand on LinkedIn with an automated weekly content engine
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
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-ink-subtle absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Founder"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-card border border-border-warm text-ink text-sm focus:border-brand focus:ring-1 focus:ring-brand/30 placeholder-ink-subtle transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-2">
                    Work Email
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
                    <span className="text-xs text-ink-subtle">Min. 8 characters</span>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-ink-subtle absolute left-3.5 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
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

                  {/* Password Strength Indicator */}
                  {password && (
                    <div className="mt-2 flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            i <= strength.level ? strength.color : 'bg-border-light'
                          }`}
                        />
                      ))}
                      <span className={`text-xs font-medium ml-1 ${
                        strength.level <= 2 ? 'text-red-500' : strength.level <= 3 ? 'text-amber-500' : 'text-green-600'
                      }`}>
                        {strength.label}
                      </span>
                    </div>
                  )}
                </div>

                {/* Terms Checkbox */}
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="w-4 h-4 rounded border-border-warm text-brand focus:ring-brand/30 mt-0.5"
                  />
                  <span className="text-sm text-ink-muted">
                    I agree to the{' '}
                    <a href="#" className="text-brand hover:text-brand-hover font-medium">Terms of Service</a>
                    {' '}and{' '}
                    <a href="#" className="text-brand hover:text-brand-hover font-medium">Privacy Policy</a>.
                  </span>
                </label>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={loading}
                  icon={ArrowRight}
                  iconPosition="right"
                  className="w-full mt-1"
                  disabled={!agreedToTerms}
                >
                  Get Started
                </Button>
              </form>

              {/* Footer Link */}
              <div className="mt-6 pt-5 border-t border-border-light text-center">
                <p className="text-sm text-ink-muted">
                  Already have an account?{' '}
                  <Link
                    to="/login"
                    className="font-semibold text-brand hover:text-brand-hover transition-colors underline"
                  >
                    Sign in here
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
              No credit card required
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
