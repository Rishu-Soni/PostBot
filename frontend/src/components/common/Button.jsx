import React from 'react';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary:
    'bg-coral hover:bg-coral-hover text-white shadow-coral border border-coral/30 active:scale-[0.98]',
  secondary:
    'bg-brand hover:bg-brand-hover text-white shadow-brand border border-brand/30 active:scale-[0.98]',
  outline:
    'bg-surface-card hover:bg-canvas text-ink border border-border-warm hover:border-ink-subtle active:scale-[0.98]',
  danger:
    'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/15 border border-red-500/40 active:scale-[0.98]',
  ghost:
    'bg-transparent hover:bg-canvas text-ink-muted hover:text-ink border border-transparent',
  subtle:
    'bg-brand-soft hover:bg-blue-100 text-brand-text border border-brand/15',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-xl gap-2',
  lg: 'px-5 py-2.5 text-base rounded-xl gap-2.5 font-medium',
};

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  iconPosition = 'left',
  className = '',
  type = 'button',
  onClick,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer select-none';
  const variantClasses = VARIANTS[variant] || VARIANTS.primary;
  const sizeClasses = SIZES[size] || SIZES.md;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${baseClasses} ${variantClasses} ${sizeClasses} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>{children}</span>
        </>
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className="w-4 h-4 shrink-0" />}
          <span>{children}</span>
          {Icon && iconPosition === 'right' && <Icon className="w-4 h-4 shrink-0" />}
        </>
      )}
    </button>
  );
};
