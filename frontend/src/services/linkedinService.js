import { api } from './api';

export const linkedinService = {
  async getConnectUrl() {
    const res = await api.get('/linkedin/connect');
    return res.data;
  },

  async handleCallback(code, state) {
    const res = await api.get(`/linkedin/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
    return res.data;
  },

  async disconnect() {
    const res = await api.delete('/linkedin/disconnect');
    return res.data;
  },
};
