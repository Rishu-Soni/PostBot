import { api } from './api';
import { mockStore } from './mockData';

export const authService = {
  async register(userData) {
    try {
      const res = await api.post('/auth/register', userData);
      mockStore.setDemoMode(false);
      return res.data;
    } catch (err) {
      // If backend is offline and user registers test email
      if (err.status === 0) {
        mockStore.setDemoMode(true);
        const user = mockStore.updateUser({ name: userData.name, email: userData.email });
        return { token: 'demo-test-jwt-token', user };
      }
      throw err;
    }
  },

  async login(credentials) {
    try {
      const res = await api.post('/auth/login', credentials);
      mockStore.setDemoMode(false);
      return res.data;
    } catch (err) {
      // If backend is offline or credentials match test user, activate local test mode
      if (err.status === 0 || credentials.email === 'test@postbot.io') {
        mockStore.setDemoMode(true);
        return {
          token: 'demo-test-jwt-token',
          user: mockStore.getUser(),
        };
      }
      throw err;
    }
  },

  async getMe() {
    if (mockStore.isDemoMode()) {
      return mockStore.getUser();
    }
    try {
      const res = await api.get('/auth/me');
      return res.data.user;
    } catch (err) {
      if (err.status === 0) {
        mockStore.setDemoMode(true);
        return mockStore.getUser();
      }
      throw err;
    }
  },

  async updateMe(updates) {
    if (mockStore.isDemoMode()) {
      return mockStore.updateUser(updates);
    }
    try {
      const res = await api.patch('/auth/me', updates);
      return res.data.user;
    } catch (err) {
      if (err.status === 0) {
        return mockStore.updateUser(updates);
      }
      throw err;
    }
  },
};
