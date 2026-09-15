import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { PostCard } from '../components/posts/PostCard';
import { AuthProvider } from '../context/AuthContext';
import { CreditsProvider } from '../context/CreditsContext';
import { ToastProvider } from '../context/ToastContext';
import { App } from '../App';

describe('Common UI Components', () => {
  it('renders Badge with correct label and dot', () => {
    render(<Badge variant="active" dot>Active Schedule</Badge>);
    expect(screen.getByText('Active Schedule')).toBeInTheDocument();
  });

  it('renders Button with label and handles loading state', () => {
    const { rerender } = render(<Button>Save Changes</Button>);
    expect(screen.getByText('Save Changes')).toBeInTheDocument();

    rerender(<Button loading>Save Changes</Button>);
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders EmptyState with title and action button', () => {
    render(
      <EmptyState
        title="No batches yet"
        description="Start your first batch"
        actionLabel="Create Batch"
        onAction={() => {}}
      />
    );
    expect(screen.getByText('No batches yet')).toBeInTheDocument();
    expect(screen.getByText('Start your first batch')).toBeInTheDocument();
    expect(screen.getByText('Create Batch')).toBeInTheDocument();
  });

  it('renders PostCard in review mode with day index and caption', () => {
    const mockPost = {
      _id: 'post-1',
      dayIndex: 1,
      caption: 'Why 80% of SaaS automation fails silently...',
      hashtags: ['#SaaS', '#Bootstrapping'],
      image: {
        url: 'https://example.com/test.jpg',
        source: 'stock',
      },
      status: 'pending',
    };

    render(
      <PostCard
        post={mockPost}
        dayIndex={1}
        mode="review"
      />
    );

    expect(screen.getByText('Day 1')).toBeInTheDocument();
    expect(screen.getByText(/Why 80% of SaaS automation fails silently/)).toBeInTheDocument();
    expect(screen.getByText('#SaaS')).toBeInTheDocument();
    expect(screen.getByText('Stock photo')).toBeInTheDocument();
  });

  it('renders PostCard in scheduled mode with status', () => {
    const mockPost = {
      _id: 'post-2',
      dayIndex: 2,
      caption: 'Day 2 insights',
      hashtags: ['#Founders'],
      scheduledTime: '2026-09-13T09:00:00.000Z',
      status: 'posted',
      linkedinPostId: 'urn:li:share:12345',
    };

    render(
      <PostCard
        post={mockPost}
        dayIndex={2}
        mode="scheduled"
      />
    );

    expect(screen.getByText('Day 2')).toBeInTheDocument();
    expect(screen.getByText('Posted')).toBeInTheDocument();
    expect(screen.getByText('Published to LinkedIn')).toBeInTheDocument();
  });
});

describe('App Routing', () => {
  it('renders login page on /login route', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <CreditsProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </CreditsProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Welcome back to PostBot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in to account/i })).toBeInTheDocument();
  });

  it('renders register page on /register route', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <AuthProvider>
          <CreditsProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </CreditsProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Create Your Account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
  });
});
