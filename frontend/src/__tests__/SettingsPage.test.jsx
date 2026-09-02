import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import SettingsPage from '../pages/SettingsPage';
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

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.setItem('postbot_token', 'fake_token');
  });

  it('renders LinkedIn status as connected', async () => {
    renderWithProviders(<SettingsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });

  it('renders Reconnect button when connected', async () => {
    renderWithProviders(<SettingsPage />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reconnect/i })).toBeInTheDocument();
    });
  });

  it('shows Connect button when not connected', async () => {
    server.use(
      http.get('/api/linkedin/status', () => {
        return HttpResponse.json({ connected: false });
      })
    );

    renderWithProviders(<SettingsPage />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Connect LinkedIn/i })).toBeInTheDocument();
    });
  });
});
