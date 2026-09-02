import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';

const TestComponent = () => {
  const { user, login, logout, loading } = useAuth();
  const [error, setError] = React.useState(null);

  if (loading) return <div>Loading...</div>;

  const handleLogin = async () => {
    try {
      await login('test@example.com', 'password');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      {error && <div data-testid="error">{error}</div>}
      {user ? (
        <>
          <span data-testid="user-name">{user.name}</span>
          <button onClick={logout}>Logout</button>
        </>
      ) : (
        <>
          <span data-testid="no-user">Not logged in</span>
          <button onClick={handleLogin}>Login</button>
        </>
      )}
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('fetches user on mount if token exists in localStorage', async () => {
    localStorage.setItem('postbot_token', 'fake_token');
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Initial state might be loading, but eventually it should show the user
    await waitFor(() => {
      expect(screen.getByTestId('user-name')).toHaveTextContent('Test User');
    });
  });

  it('handles login successfully', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for initial fetch to finish (it will fail since no token)
    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeInTheDocument();
    });

    const userInstance = userEvent.setup();
    await userInstance.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByTestId('user-name')).toHaveTextContent('Test User');
    });
    expect(localStorage.getItem('postbot_token')).toBe('fake_jwt_token');
  });

  it('handles login failure', async () => {
    server.use(
      http.post('http://localhost/api/auth/login', () => {
        return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      })
    );

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeInTheDocument();
    });

    const userInstance = userEvent.setup();
    await userInstance.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Invalid credentials');
    });
    expect(localStorage.getItem('postbot_token')).toBeNull();
  });

  it('handles logout', async () => {
    localStorage.setItem('postbot_token', 'fake_token');
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-name')).toBeInTheDocument();
    });

    const userInstance = userEvent.setup();
    await userInstance.click(screen.getByText('Logout'));

    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeInTheDocument();
    });
    expect(localStorage.getItem('postbot_token')).toBeNull();
  });
});
