import React from 'react';

export const Card = ({
  children,
  className = '',
  hover = false,
  onClick,
  ...props
}) => {
  const baseClasses = 'rounded-2xl border transition-all duration-200';
  const surfaceClasses = 'bg-surface-card border-border-warm shadow-warm-sm';
  const hoverClasses = hover ? 'hover:shadow-warm-md hover:border-border-warm cursor-pointer' : '';

  return (
    <div
      onClick={onClick}
      className={`${baseClasses} ${surfaceClasses} ${hoverClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = '' }) => (
  <div className={`p-5 sm:p-6 border-b border-border-light ${className}`}>{children}</div>
);

export const CardContent = ({ children, className = '' }) => (
  <div className={`p-5 sm:p-6 ${className}`}>{children}</div>
);

export const CardFooter = ({ children, className = '' }) => (
  <div className={`p-4 sm:p-6 border-t border-border-light bg-canvas/30 rounded-b-2xl ${className}`}>
    {children}
  </div>
);
