import { api } from './api';

export const creditService = {
  async getBalance() {
    const res = await api.get('/credits/balance');
    return res.data.creditBalance;
  },

  async getTransactions(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);

    const res = await api.get(`/credits/transactions?${query.toString()}`);
    return res.data;
  },
};
