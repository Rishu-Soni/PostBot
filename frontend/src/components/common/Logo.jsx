import React from 'react';

/**
 * Reusable PostBot Logo component
 * @param {'xs' | 'sm' | 'md' | 'lg' | 'xl'} size - size of the logo icon
 * @param {string} className - additional classes for the img element
 */
export const Logo = ({ size = 'md', className = '', alt = 'PostBot Logo' }) => {
  const sizeMap = {
    xs: 'w-6 h-6 rounded-md',
    sm: 'w-7 h-7 rounded-lg',
    md: 'w-9 h-9 rounded-xl',
    lg: 'w-10 h-10 rounded-xl',
    xl: 'w-12 h-12 rounded-2xl',
  };

  const sizeClass = sizeMap[size] || sizeMap.md;

  return (
    <img
      src="/favicon.png"
      alt={alt}
      className={`${sizeClass} object-cover shadow-sm shrink-0 ${className}`}
    />
  );
};
