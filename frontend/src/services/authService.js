import { api } from './api';

export const authService = {
  async register(userData) {
    const res = await api.post('/auth/register', userData);
    return res.data;
  },

  async login(credentials) {
    const res = await api.post('/auth/login', credentials);
    return res.data;
  },

  async getMe() {
    const res = await api.get('/auth/me');
    return res.data.user;
  },

  async updateMe(updates) {
    const res = await api.patch('/auth/me', updates);
    return res.data.user;
  },
};
