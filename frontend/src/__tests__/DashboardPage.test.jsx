import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import { AuthProvider } from '../context/AuthContext';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';

const renderWithProviders = (ui) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        {ui}
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('DashboardPage', () => {
  beforeEach(() => {
    localStorage.setItem('postbot_token', 'fake_token');
  });

  it('renders welcome message and profile information', async () => {
    // The AuthProvider will fetch /auth/me and populate the user
    renderWithProviders(<DashboardPage />);
    
    await waitFor(() => {
      // handlers.js mock returns user: { name: 'Test User', email: 'test@example.com' }
      expect(screen.getByText(/Welcome back, Test User!/i)).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });
  });

  it('renders navigation links to journeys', async () => {
    renderWithProviders(<DashboardPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/View Journeys/i)).toBeInTheDocument();
      expect(screen.getByText(/New Journey/i)).toBeInTheDocument();
    });
  });
});
