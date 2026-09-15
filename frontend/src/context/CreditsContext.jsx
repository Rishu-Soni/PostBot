import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { creditService } from '../services/creditService';
import { useAuth } from './AuthContext';

const CreditsContext = createContext(null);

export const CreditsProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [creditBalance, setCreditBalance] = useState(user?.creditBalance ?? 0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // Sync with user's creditBalance when user object changes
  useEffect(() => {
    if (user?.creditBalance !== undefined) {
      setCreditBalance(user.creditBalance);
    }
  }, [user?.creditBalance]);

  const refreshBalance = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoadingBalance(true);
    try {
      const balance = await creditService.getBalance();
      setCreditBalance(balance);
      return balance;
    } catch (err) {
      console.error('Failed to fetch credit balance:', err);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshBalance();
    }
  }, [isAuthenticated, refreshBalance]);

  const deductCredits = (amount) => {
    setCreditBalance((prev) => Math.max(0, prev - amount));
  };

  const hasCredits = (required = 1) => {
    return creditBalance >= required;
  };

  return (
    <CreditsContext.Provider
      value={{
        creditBalance,
        isLoadingBalance,
        refreshBalance,
        deductCredits,
        hasCredits,
      }}
    >
      {children}
    </CreditsContext.Provider>
  );
};

export const useCredits = () => {
  const context = useContext(CreditsContext);
  if (!context) {
    throw new Error('useCredits must be used within a CreditsProvider');
  }
  return context;
};
