import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';

// Auth Pages
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';

// Main App Pages
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { BatchIntakePage } from './pages/batches/BatchIntakePage';
import { DayCountRecommendPage } from './pages/batches/DayCountRecommendPage';
import { BatchReviewPage } from './pages/batches/BatchReviewPage';
import { BatchesListPage } from './pages/batches/BatchesListPage';
import { BatchDetailPage } from './pages/batches/BatchDetailPage';
import { CreditsPage } from './pages/credits/CreditsPage';
import { NotificationsPage } from './pages/notifications/NotificationsPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { LinkedInCallbackPage } from './pages/oauth/LinkedInCallbackPage';

export const App = () => {
  return (
    <Routes>
      {/* Public Auth Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/linkedin/callback" element={<LinkedInCallbackPage />} />

      {/* Protected App Routes inside AppShell */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/batches" element={<BatchesListPage />} />
        <Route path="/batches/new" element={<BatchIntakePage />} />
        <Route path="/batches/:batchId/recommendation" element={<DayCountRecommendPage />} />
        <Route path="/batches/:batchId/review" element={<BatchReviewPage />} />
        <Route path="/batches/:batchId" element={<BatchDetailPage />} />
        <Route path="/credits" element={<CreditsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};
