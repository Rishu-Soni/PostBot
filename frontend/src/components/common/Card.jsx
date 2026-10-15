import React from 'react';

export const Card = ({
  children,
  className = '',
  hover = false,
  topGradient = false,
  onClick,
  ...props
}) => {
  const baseClasses = 'rounded-[16px] border border-border-warm/60 transition-all duration-200 overflow-hidden';
  const surfaceClasses = 'bg-[#FFFFFF] shadow-card';
  const hoverClasses = hover ? 'hover:shadow-lg hover:border-border-warm cursor-pointer' : '';
  const gradientClasses = topGradient ? 'gradient-bar' : '';

  return (
    <div
      onClick={onClick}
      className={`${baseClasses} ${surfaceClasses} ${hoverClasses} ${gradientClasses} ${className}`}
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
