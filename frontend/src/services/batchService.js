import { api } from './api';

export const batchService = {
  async createBatch(batchData) {
    const res = await api.post('/batches', batchData);
    return res.data;
  },

  async getBatches(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.status && params.status !== 'all') query.set('status', params.status);

    const res = await api.get(`/batches?${query.toString()}`);
    return res.data;
  },

  async getBatchById(batchId) {
    const res = await api.get(`/batches/${batchId}`);
    return res.data;
  },

  async updateDayCount(batchId, finalDayCount, scheduledDates) {
    const res = await api.patch(`/batches/${batchId}/day-count`, { finalDayCount, scheduledDates });
    return res.data;
  },

  async confirmBatch(batchId) {
    const res = await api.post(`/batches/${batchId}/confirm`, {});
    return res.data;
  },

  async cancelBatch(batchId) {
    const res = await api.delete(`/batches/${batchId}`);
    return res.data;
  },
};
