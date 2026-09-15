import React from 'react';

const VARIANT_STYLES = {
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  active: 'bg-green-50 text-green-700 border-green-200',
  exhausted: 'bg-gray-100 text-gray-500 border-gray-200',
  posted: 'bg-green-50 text-green-700 border-green-200',
  pending: 'bg-gray-50 text-gray-600 border-gray-200',
  failed: 'bg-red-50 text-red-600 border-red-200',
  stock: 'bg-blue-50 text-blue-600 border-blue-200',
  ai: 'bg-purple-50 text-purple-600 border-purple-200',
  user_upload: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  connected: 'bg-green-50 text-green-700 border-green-200',
  disconnected: 'bg-red-50 text-red-600 border-red-200',
  indigo: 'bg-brand-soft text-brand border-brand/20',
  neutral: 'bg-gray-100 text-ink-muted border-gray-200',
};

export const Badge = ({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  dotColor,
  className = '',
}) => {
  const style = VARIANT_STYLES[variant] || VARIANT_STYLES.neutral;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border capitalize tracking-wide ${sizeClasses} ${style} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            dotColor ||
            (variant === 'active' || variant === 'posted' || variant === 'connected'
              ? 'bg-green-500 animate-pulse'
              : variant === 'failed' || variant === 'disconnected'
              ? 'bg-red-400'
              : variant === 'draft'
              ? 'bg-amber-500'
              : 'bg-gray-400')
          }`}
        />
      )}
      {children}
    </span>
  );
};
