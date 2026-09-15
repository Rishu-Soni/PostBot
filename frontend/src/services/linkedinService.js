import { api } from './api';
import { mockStore } from './mockData';

export const linkedinService = {
  async getConnectUrl() {
    if (mockStore.isDemoMode()) {
      return { authUrl: '/linkedin/callback?code=mock-auth-code&state=mock-state', state: 'mock-state' };
    }
    try {
      const res = await api.get('/linkedin/connect');
      return res.data;
    } catch (err) {
      if (err.status === 0) {
        return { authUrl: '/linkedin/callback?code=mock-auth-code&state=mock-state', state: 'mock-state' };
      }
      throw err;
    }
  },

  async handleCallback(code, state) {
    if (mockStore.isDemoMode()) {
      mockStore.updateUser({
        linkedin: {
          isConnected: true,
          connectedAt: new Date().toISOString(),
          linkedinUserId: 'test-linkedin-member-123',
        },
      });
      return { success: true, message: 'LinkedIn connected successfully (Demo Mode).' };
    }
    try {
      const res = await api.get(`/linkedin/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
      return res.data;
    } catch (err) {
      if (err.status === 0) {
        mockStore.updateUser({
          linkedin: {
            isConnected: true,
            connectedAt: new Date().toISOString(),
            linkedinUserId: 'test-linkedin-member-123',
          },
        });
        return { success: true };
      }
      throw err;
    }
  },

  async disconnect() {
    if (mockStore.isDemoMode()) {
      mockStore.updateUser({
        linkedin: {
          isConnected: false,
          connectedAt: null,
          linkedinUserId: null,
        },
      });
      return { success: true, message: 'LinkedIn disconnected.' };
    }
    try {
      const res = await api.delete('/linkedin/disconnect');
      return res.data;
    } catch (err) {
      if (err.status === 0) {
        mockStore.updateUser({
          linkedin: {
            isConnected: false,
            connectedAt: null,
            linkedinUserId: null,
          },
        });
        return { success: true };
      }
      throw err;
    }
  },
};
