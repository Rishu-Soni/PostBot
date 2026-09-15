import { api } from './api';
import { mockStore } from './mockData';

export const batchService = {
  async createBatch(batchData) {
    if (mockStore.isDemoMode()) {
      return mockStore.createBatch(batchData);
    }
    try {
      const res = await api.post('/batches', batchData);
      return res.data;
    } catch (err) {
      if (err.status === 0) return mockStore.createBatch(batchData);
      throw err;
    }
  },

  async getBatches(params = {}) {
    if (mockStore.isDemoMode()) {
      const all = mockStore.getBatches(params.status);
      const page = params.page || 1;
      const limit = params.limit || 10;
      const start = (page - 1) * limit;
      return {
        batches: all.slice(start, start + limit),
        total: all.length,
        page,
        limit,
      };
    }
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.status && params.status !== 'all') query.set('status', params.status);

    try {
      const res = await api.get(`/batches?${query.toString()}`);
      return res.data;
    } catch (err) {
      if (err.status === 0) {
        const all = mockStore.getBatches(params.status);
        return { batches: all, total: all.length, page: 1, limit: 10 };
      }
      throw err;
    }
  },

  async getBatchById(batchId) {
    if (mockStore.isDemoMode()) {
      return mockStore.getBatchById(batchId);
    }
    try {
      const res = await api.get(`/batches/${batchId}`);
      return res.data;
    } catch (err) {
      if (err.status === 0) return mockStore.getBatchById(batchId);
      throw err;
    }
  },

  async updateDayCount(batchId, finalDayCount) {
    if (mockStore.isDemoMode()) {
      return mockStore.updateDayCount(batchId, finalDayCount);
    }
    try {
      const res = await api.patch(`/batches/${batchId}/day-count`, { finalDayCount });
      return res.data;
    } catch (err) {
      if (err.status === 0) return mockStore.updateDayCount(batchId, finalDayCount);
      throw err;
    }
  },

  async confirmBatch(batchId) {
    if (mockStore.isDemoMode()) {
      return mockStore.confirmBatch(batchId);
    }
    try {
      const res = await api.post(`/batches/${batchId}/confirm`, {});
      return res.data;
    } catch (err) {
      if (err.status === 0) return mockStore.confirmBatch(batchId);
      throw err;
    }
  },

  async cancelBatch(batchId) {
    if (mockStore.isDemoMode()) {
      return mockStore.cancelBatch(batchId);
    }
    try {
      const res = await api.delete(`/batches/${batchId}`);
      return res.data;
    } catch (err) {
      if (err.status === 0) return mockStore.cancelBatch(batchId);
      throw err;
    }
  },
};
