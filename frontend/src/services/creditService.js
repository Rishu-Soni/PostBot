import { api } from './api';
import { mockStore } from './mockData';

export const creditService = {
  async getBalance() {
    if (mockStore.isDemoMode()) {
      return mockStore.getUser().creditBalance;
    }
    try {
      const res = await api.get('/credits/balance');
      return res.data.creditBalance;
    } catch (err) {
      if (err.status === 0) return mockStore.getUser().creditBalance;
      throw err;
    }
  },

  async getTransactions(params = {}) {
    if (mockStore.isDemoMode()) {
      return mockStore.getTransactions(params.page || 1, params.limit || 15);
    }
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);

    try {
      const res = await api.get(`/credits/transactions?${query.toString()}`);
      return res.data;
    } catch (err) {
      if (err.status === 0) {
        return mockStore.getTransactions(params.page || 1, params.limit || 15);
      }
      throw err;
    }
  },
};
