import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { Modal } from '../components/common/Modal';
import { Skeleton, CardSkeleton } from '../components/common/Skeleton';
import { LinkedInIcon } from '../components/common/LinkedInIcon';
import { PostEditDrawer } from '../components/posts/PostEditDrawer';
import { ImageUploader } from '../components/posts/ImageUploader';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { CreditsProvider, useCredits } from '../context/CreditsContext';
import { ToastProvider, useToast } from '../context/ToastContext';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { BatchesListPage } from '../pages/batches/BatchesListPage';
import { DayCountRecommendPage } from '../pages/batches/DayCountRecommendPage';
import { BatchIntakePage } from '../pages/batches/BatchIntakePage';
import { batchService } from '../services/batchService';
import { postService } from '../services/postService';
import { authService } from '../services/authService';
import { notificationService } from '../services/notificationService';

// Mock services
vi.mock('../services/batchService', () => ({
  batchService: {
    getBatches: vi.fn(),
    getBatchById: vi.fn(),
    createBatch: vi.fn(),
    updateDayCount: vi.fn(),
    confirmBatch: vi.fn(),
    cancelBatch: vi.fn(),
  },
}));

vi.mock('../services/postService', () => ({
  postService: {
    getPost: vi.fn(),
    updatePost: vi.fn(),
    regeneratePost: vi.fn(),
    uploadImage: vi.fn(),
    postNow: vi.fn(),
  },
}));

vi.mock('../services/authService', () => ({
  authService: {
    getMe: vi.fn(),
    updateMe: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
  },
}));

vi.mock('../services/notificationService', () => ({
  notificationService: {
    getNotifications: vi.fn(),
    resolveNotification: vi.fn(),
  },
}));

describe('Modal Component', () => {
  it('renders modal when open and closes on button click', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal" description="Modal description">
        <div>Modal Body</div>
      </Modal>
    );

    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal description')).toBeInTheDocument();
    expect(screen.getByText('Modal Body')).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalled();
  });

  it('does not render when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Test Modal">
        <div>Body</div>
      </Modal>
    );
    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
  });
});

describe('Skeleton Components', () => {
  it('renders Skeleton and CardSkeleton without crashing', () => {
    const { container } = render(
      <div>
        <Skeleton className="h-10 w-20" />
        <CardSkeleton />
      </div>
    );
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});

describe('LinkedInIcon Component', () => {
  it('renders svg with custom class', () => {
    const { container } = render(<LinkedInIcon className="w-5 h-5 text-indigo-400" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

describe('PostEditDrawer Component', () => {
  const mockPost = {
    _id: 'post-101',
    dayIndex: 3,
    caption: 'Initial post draft',
    hashtags: ['#ai', '#startups'],
    image: { url: 'https://example.com/test.png', source: 'stock' },
    status: 'pending',
  };

  it('renders post details, allows editing caption and adding hashtags', async () => {
    postService.updatePost.mockResolvedValueOnce({
      ...mockPost,
      caption: 'Updated caption',
      hashtags: ['#ai', '#startups', '#founder'],
    });

    render(
      <AuthProvider>
        <CreditsProvider>
          <ToastProvider>
            <PostEditDrawer
              isOpen={true}
              onClose={() => {}}
              post={mockPost}
              onPostUpdated={() => {}}
            />
          </ToastProvider>
        </CreditsProvider>
      </AuthProvider>
    );

    expect(screen.getByText('Day 3')).toBeInTheDocument();
    expect(screen.getByText('#ai')).toBeInTheDocument();
    expect(screen.getByText('#startups')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText('Write your LinkedIn caption here...');
    fireEvent.change(textarea, { target: { value: 'Updated caption' } });

    const tagInput = screen.getByPlaceholderText('Type tag & press enter');
    fireEvent.change(tagInput, { target: { value: 'founder' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });

    expect(screen.getByText('#founder')).toBeInTheDocument();

    const saveBtn = screen.getByText('Save Text Changes');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(postService.updatePost).toHaveBeenCalledWith('post-101', {
        caption: 'Updated caption',
        hashtags: ['#ai', '#startups', '#founder'],
      });
    });
  });
});

describe('BatchIntakePage Component', () => {
  it('validates brain dump before submission', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <CreditsProvider>
            <ToastProvider>
              <BatchIntakePage />
            </ToastProvider>
          </CreditsProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('New Weekly Batch')).toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: /elaborate my week/i });
    fireEvent.click(submitBtn);

    // Should not call createBatch with empty dump
    expect(batchService.createBatch).not.toHaveBeenCalled();
  });
});

describe('BatchesListPage Component', () => {
  it('fetches and displays user batches', async () => {
    batchService.getBatches.mockResolvedValueOnce({
      batches: [
        {
          _id: 'b-1',
          theme: 'B2B Growth Secrets',
          status: 'active',
          finalDayCount: 5,
          createdAt: '2026-09-12T10:00:00.000Z',
        },
      ],
      total: 1,
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <CreditsProvider>
            <ToastProvider>
              <BatchesListPage />
            </ToastProvider>
          </CreditsProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('B2B Growth Secrets')).toBeInTheDocument();
      expect(screen.getByText('active')).toBeInTheDocument();
      expect(screen.getByText('5 Days')).toBeInTheDocument();
    });
  });
});
