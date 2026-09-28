import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CreditsProvider } from './context/CreditsContext';
import { ToastProvider } from './context/ToastContext';
import { App } from './App';
import './index.css';

// Purge any legacy mock / demo keys from localStorage
const legacyMockKeys = [
  'postbot_demo_mode',
  'postbot_mock_version',
  'postbot_mock_user',
  'postbot_mock_batches',
  'postbot_mock_posts',
  'postbot_mock_transactions',
  'postbot_mock_notifications',
];
legacyMockKeys.forEach((key) => localStorage.removeItem(key));
if (localStorage.getItem('postbot_token') === 'demo-test-jwt-token') {
  localStorage.removeItem('postbot_token');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CreditsProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </CreditsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
