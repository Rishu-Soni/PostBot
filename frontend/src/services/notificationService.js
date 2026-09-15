import { api } from './api';
import { mockStore } from './mockData';

export const notificationService = {
  async getNotifications(params = {}) {
    if (mockStore.isDemoMode()) {
      return mockStore.getNotifications(params.resolved);
    }
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.resolved !== undefined && params.resolved !== 'all') {
      query.set('resolved', params.resolved);
    }

    try {
      const res = await api.get(`/notifications?${query.toString()}`);
      return res.data;
    } catch (err) {
      if (err.status === 0) {
        return mockStore.getNotifications(params.resolved);
      }
      throw err;
    }
  },

  async resolveNotification(id) {
    if (mockStore.isDemoMode()) {
      return mockStore.resolveNotification(id);
    }
    try {
      const res = await api.patch(`/notifications/${id}/resolve`, {});
      return res.data.notification;
    } catch (err) {
      if (err.status === 0) return mockStore.resolveNotification(id);
      throw err;
    }
  },
};
