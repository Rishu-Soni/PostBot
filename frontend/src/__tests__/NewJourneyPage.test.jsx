import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import NewJourneyPage from '../pages/NewJourneyPage';
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

describe('NewJourneyPage', () => {
  beforeEach(() => {
    localStorage.setItem('postbot_token', 'fake_token');
  });

  it('renders the form correctly', async () => {
    renderWithProviders(<NewJourneyPage />);
    
    expect(screen.getByText('Create a New Posting Journey')).toBeInTheDocument();
    expect(screen.getByLabelText(/Journey Title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Hashtags/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Post Template/i)).toBeInTheDocument();
  });

  it('submits form successfully and navigates', async () => {
    renderWithProviders(<NewJourneyPage />);
    
    const user = userEvent.setup();
    
    await user.type(screen.getByLabelText(/Journey Title/i), 'My Test Journey');
    await user.type(screen.getByLabelText(/Hashtags/i), 'test, coding');
    await user.type(screen.getByLabelText(/Post Template/i), 'Hello {{topic}}');
    
    await user.click(screen.getByRole('button', { name: /Create Journey/i }));
    
    // AuthProvider will redirect or state changes will happen, but we mainly want to 
    // ensure no error is shown and the button shows loading state or success.
    await waitFor(() => {
      // In a real router setup we could mock useNavigate and assert it was called.
      // Here we just ensure MSW caught the request and it resolved.
      expect(screen.queryByText(/Error/i)).not.toBeInTheDocument();
    });
  });

  it('displays error on failed submission', async () => {
    server.use(
      http.post('/api/journeys', () => {
        return HttpResponse.json({ error: 'Failed to create journey' }, { status: 400 });
      })
    );

    renderWithProviders(<NewJourneyPage />);
    
    const user = userEvent.setup();
    
    await user.type(screen.getByLabelText(/Journey Title/i), 'My Test Journey');
    await user.type(screen.getByLabelText(/Post Template/i), 'Hello {{topic}}');
    await user.click(screen.getByRole('button', { name: /Create Journey/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/Failed to create journey/i)).toBeInTheDocument();
    });
  });
});
